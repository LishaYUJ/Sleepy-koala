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
    [Route("api/me/summary")]
    public class DashboardController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly ICheckInService _checkInService;
        private readonly ISleepCalendarService _sleepCalendar;

        public DashboardController(
            ApplicationDbContext context,
            ICheckInService checkInService,
            ISleepCalendarService sleepCalendar)
        {
            _context = context;
            _checkInService = checkInService;
            _sleepCalendar = sleepCalendar;
        }

        [HttpGet]
        public async Task<IActionResult> GetSummary([FromQuery] string localDate, [FromQuery] string localTime)
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users
                .Include(u => u.Settings)
                .Include(u => u.UserBadges)
                .ThenInclude(ub => ub.Badge)
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
            var localDateStr = calendar.CurrentSleepDate.ToString("yyyy-MM-dd");

            var todayCheckIn = await _context.CheckIns
                .FirstOrDefaultAsync(c => c.UserId == userId.Value && c.LocalCheckInDate == localDateStr);

            var lastCheckIn = await _context.CheckIns
                .Where(c => c.UserId == userId.Value)
                .OrderByDescending(c => c.LocalCheckInDate)
                .FirstOrDefaultAsync();

            int displayStreak = user.CurrentStreak;
            if (lastCheckIn != null &&
                DateOnly.TryParse(localDateStr, out var currentD) &&
                DateOnly.TryParse(lastCheckIn.LocalCheckInDate, out var lastD))
            {
                if (currentD.DayNumber - lastD.DayNumber > 1)
                {
                    displayStreak = 0;
                }
            }
            else if (lastCheckIn == null)
            {
                displayStreak = 0;
            }

            int consecutiveBadDays = 0;
            int fatigueScore = 0;
            string? inferredTodayStatus = todayCheckIn?.Status;
            if (DateOnly.TryParse(localDateStr, out var todayDate))
            {
                var checkInMap = await _context.CheckIns
                    .Where(c => c.UserId == userId.Value)
                    .ToDictionaryAsync(c => c.LocalCheckInDate, c => c.Status);

                if (todayCheckIn == null &&
                    calendar.CurrentSleepDate >= _sleepCalendar.GetTrackingStartSleepDate(user.Settings, calendar) &&
                    calendar.CurrentSleepDate <= calendar.LastClosedSleepDate)
                {
                    inferredTodayStatus = "missing";
                    fatigueScore += 2;
                }

                var dateToCheck = todayDate.AddDays(-1);
                var registerDate = _sleepCalendar.GetTrackingStartSleepDate(user.Settings, calendar);

                for (int i = 0; i < 30; i++)
                {
                    if (dateToCheck < registerDate)
                    {
                        break;
                    }

                    var dateStr = dateToCheck.ToString("yyyy-MM-dd");
                    if (checkInMap.TryGetValue(dateStr, out var checkStatus))
                    {
                        if (checkStatus == "onTime")
                        {
                            break;
                        }
                        else if (checkStatus == "late")
                        {
                            consecutiveBadDays++;
                            fatigueScore += 1;
                        }
                    }
                    else
                    {
                        consecutiveBadDays++;
                        fatigueScore += 2;
                    }
                    dateToCheck = dateToCheck.AddDays(-1);
                }
            }

            var mood = _checkInService.CalculateKoalaMood(user, lastCheckIn?.Status ?? "onTime");
            // The visible 10-heart energy system is the inverse of fatigue:
            // 0-4 fatigue = healthy, 5-7 = weak, 8+ = very weak.
            var fatigueState = fatigueScore >= 8 ? "veryWeak" : fatigueScore >= 5 ? "weak" : "healthy";
            if (inferredTodayStatus == "missing")
            {
                displayStreak = 0;
            }

            var summary = new DashboardSummaryDto
            {
                TodayCheckedIn = todayCheckIn != null,
                TodayStatus = inferredTodayStatus,
                CurrentStreak = displayStreak,
                LongestStreak = user.LongestStreak,
                KoalaMood = mood,
                CutoffTime = user.Settings.CutoffTime,
                ConsecutiveBadDays = consecutiveBadDays,
                FatigueScore = fatigueScore,
                FatigueState = fatigueState,
                Badges = user.UserBadges.Select(ub => new BadgeDto
                {
                    Name = ub.Badge!.Name,
                    Description = ub.Badge.Description,
                    UnlockedAt = ub.UnlockedAtUtc.ToString("O")
                }).ToList()
            };

            return Ok(summary);
        }
    }
}
