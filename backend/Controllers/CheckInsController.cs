using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.DTOs;
using SleepyKoala.Api.Extensions;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Api.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
    public class CheckInsController : ControllerBase
    {
        private const int MaxConsecutiveMissingNights = 7;
        private readonly ICheckInService _checkInService;
        private readonly ApplicationDbContext _context;
        private readonly ISleepCalendarService _sleepCalendar;

        public CheckInsController(
            ICheckInService checkInService,
            ApplicationDbContext context,
            ISleepCalendarService sleepCalendar)
        {
            _checkInService = checkInService;
            _context = context;
            _sleepCalendar = sleepCalendar;
        }

        [HttpPost]
        public async Task<IActionResult> CreateCheckIn(CheckInRequest request)
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();

            try
            {
                var response = await _checkInService.CheckInAsync(userId.Value, request);
                if (response == null) return NotFound();
                return Ok(response);
            }
            catch (InvalidOperationException ex) when (ex.Message == "DuplicateCheckIn")
            {
                return BadRequest(new { error = "DuplicateCheckIn", message = "You have already checked in for this sleep day." });
            }
            catch (InvalidOperationException ex) when (ex.Message == "CheckInWindowClosed")
            {
                return BadRequest(new { error = "CheckInWindowClosed", message = "Check-in is only available from 21:00 to 02:00." });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = "InvalidArgument", message = ex.Message });
            }
        }

        [HttpGet("me")]
        public async Task<IActionResult> GetMyCheckIns([FromQuery] string localDate, [FromQuery] string localTime)
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users
                .Include(u => u.Settings)
                .Include(u => u.CheckIns)
                .FirstOrDefaultAsync(u => u.Id == userId.Value);

            if (user == null || user.Settings == null) return NotFound();

            SleepCalendarContext calendar;
            try { calendar = _sleepCalendar.GetContext(localDate, localTime); }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = "InvalidLocalTime", message = ex.Message });
            }

            if (user.Settings.TrackingStartSleepDate == null)
            {
                var firstRecorded = await _context.CheckIns.Where(c => c.UserId == user.Id)
                    .OrderBy(c => c.LocalCheckInDate).Select(c => c.LocalCheckInDate).FirstOrDefaultAsync();
                user.Settings.TrackingStartSleepDate = firstRecorded ?? _sleepCalendar
                    .GetTrackingStartSleepDate(user.Settings, calendar).ToString("yyyy-MM-dd");
                await _context.SaveChangesAsync();
            }
            var checkInsByDate = user.CheckIns
                .Where(c => DateOnly.TryParseExact(c.LocalCheckInDate, "yyyy-MM-dd", out _))
                .ToDictionary(c => c.LocalCheckInDate);

            var firstRecordedDate = checkInsByDate.Keys
                .Select(date => DateOnly.ParseExact(date, "yyyy-MM-dd"))
                .OrderBy(date => date)
                .FirstOrDefault();

            var trackingStart = _sleepCalendar.GetTrackingStartSleepDate(user.Settings, calendar);

            // Never hide a real check-in because an older onboarding flow stored
            // a tracking start date after the sleep day that the check-in belongs to.
            if (firstRecordedDate != default && firstRecordedDate < trackingStart)
            {
                trackingStart = firstRecordedDate;
            }

            var latestRecordedDate = checkInsByDate.Keys
                .Select(date => DateOnly.ParseExact(date, "yyyy-MM-dd"))
                .OrderByDescending(date => date)
                .FirstOrDefault();
            var lastDate = latestRecordedDate > calendar.LastClosedSleepDate
                ? latestRecordedDate
                : calendar.LastClosedSleepDate;

            // Keep the response bounded while covering far more than the current UI needs.
            if (lastDate.DayNumber - trackingStart.DayNumber > 729)
            {
                trackingStart = lastDate.AddDays(-729);
            }

            var history = new List<CheckInHistoryDto>();
            var consecutiveMissingNights = 0;
            for (var sleepDate = trackingStart; sleepDate <= lastDate; sleepDate = sleepDate.AddDays(1))
            {
                var dateKey = sleepDate.ToString("yyyy-MM-dd");
                if (checkInsByDate.TryGetValue(dateKey, out var checkIn))
                {
                    history.Add(new CheckInHistoryDto
                    {
                        Id = checkIn.Id,
                        LocalCheckInDate = dateKey,
                        Status = checkIn.Status,
                        Recorded = true,
                        CheckedInAtUtc = DateTime.SpecifyKind(checkIn.CreatedAtUtc, DateTimeKind.Utc)
                    });
                    consecutiveMissingNights = 0;
                }
                else if (sleepDate <= calendar.LastClosedSleepDate)
                {
                    if (consecutiveMissingNights < MaxConsecutiveMissingNights)
                    {
                        history.Add(new CheckInHistoryDto
                        {
                            Id = null,
                            LocalCheckInDate = dateKey,
                            Status = "missing",
                            Recorded = false,
                            CheckedInAtUtc = null
                        });
                    }

                    consecutiveMissingNights++;
                }
            }

            return Ok(history.OrderByDescending(item => item.LocalCheckInDate));
        }

    }
}
