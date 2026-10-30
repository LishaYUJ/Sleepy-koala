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
    [Route("api/settings/me")]
    public class SettingsController : ControllerBase
    {
        private const int MaxAvatarBytes = 512 * 1024;
        private static readonly HashSet<string> AllowedAvatarMimeTypes =
        [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        private readonly ApplicationDbContext _context;
        private readonly ISleepCalendarService _sleepCalendar;

        public SettingsController(
            ApplicationDbContext context,
            ISleepCalendarService sleepCalendar)
        {
            _context = context;
            _sleepCalendar = sleepCalendar;
        }

        [HttpGet]
        public async Task<IActionResult> GetSettings()
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users
                .Include(u => u.Settings)
                .FirstOrDefaultAsync(u => u.Id == userId.Value);

            if (user == null || user.Settings == null) return NotFound();

            return Ok(new SettingsDto
            {
                Nickname = user.Nickname,
                CutoffTime = user.Settings.CutoffTime,
                OnboardingCompleted = user.Settings.OnboardingCompleted,
                AvatarDataUrl = user.AvatarDataUrl
            });
        }

        [HttpPut]
        public async Task<IActionResult> UpdateSettings(UpdateSettingsRequest dto)
        {
            var userId = User.GetUserId();
            if (userId == null) return Unauthorized();

            // Validate bedtime cutoff time is between 21:00 and midnight.
            if (!TimeSpan.TryParse(dto.CutoffTime, out var cutoffSpan) ||
                (cutoffSpan != TimeSpan.Zero &&
                (cutoffSpan < new TimeSpan(21, 0, 0) ||
                 cutoffSpan > new TimeSpan(23, 59, 59))))
            {
                return BadRequest(new { error = "InvalidCutoffTime", message = "Bedtime (CutoffTime) must be between 21:00 and 00:00 for the MVP." });
            }

            SleepCalendarContext calendar;
            try { calendar = _sleepCalendar.GetContext(dto.LocalDate, dto.LocalTime); }
            catch (ArgumentException ex)
            {
                return BadRequest(new { error = "InvalidLocalTime", message = ex.Message });
            }



            var user = await _context.Users
                .Include(u => u.Settings)
                .FirstOrDefaultAsync(u => u.Id == userId.Value);

            if (user == null || user.Settings == null) return NotFound();

            if (dto.AvatarDataUrl != null && !TryValidateAvatar(dto.AvatarDataUrl, out var avatarError))
            {
                return BadRequest(new { error = "InvalidAvatar", message = avatarError });
            }

            var completesOnboarding = !user.Settings.OnboardingCompleted && dto.OnboardingCompleted;

            user.Nickname = dto.Nickname.Trim();
            user.Settings.CutoffTime = dto.CutoffTime;
            user.Settings.OnboardingCompleted = dto.OnboardingCompleted;
            if (completesOnboarding || user.Settings.TrackingStartSleepDate == null)
            {
                user.Settings.TrackingStartSleepDate = _sleepCalendar
                    .GetInitialTrackingStartSleepDate(user.Settings, calendar)
                    .ToString("yyyy-MM-dd");
            }
            if (dto.AvatarDataUrl != null)
            {
                user.AvatarDataUrl = string.IsNullOrWhiteSpace(dto.AvatarDataUrl)
                    ? null
                    : dto.AvatarDataUrl;
            }

            await _context.SaveChangesAsync();

            return Ok(new SettingsDto
            {
                Nickname = user.Nickname,
                CutoffTime = user.Settings.CutoffTime,
                OnboardingCompleted = user.Settings.OnboardingCompleted,
                AvatarDataUrl = user.AvatarDataUrl
            });
        }

        private static bool TryValidateAvatar(string avatarDataUrl, out string error)
        {
            error = string.Empty;
            if (string.IsNullOrWhiteSpace(avatarDataUrl)) return true;

            var separatorIndex = avatarDataUrl.IndexOf(',');
            if (separatorIndex <= 5 || !avatarDataUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                error = "Avatar must be a valid image data URL.";
                return false;
            }

            var metadataParts = avatarDataUrl[5..separatorIndex]
                .Split(';', StringSplitOptions.RemoveEmptyEntries);
            if (metadataParts.Length != 2 ||
                !AllowedAvatarMimeTypes.Contains(metadataParts[0].ToLowerInvariant()) ||
                !metadataParts[1].Equals("base64", StringComparison.OrdinalIgnoreCase))
            {
                error = "Avatar must be a JPEG, PNG, or WebP image.";
                return false;
            }

            try
            {
                var bytes = Convert.FromBase64String(avatarDataUrl[(separatorIndex + 1)..]);
                if (bytes.Length > MaxAvatarBytes)
                {
                    error = "Avatar must be smaller than 512 KB after processing.";
                    return false;
                }

                if (!HasExpectedImageSignature(metadataParts[0], bytes))
                {
                    error = "Avatar image contents do not match its declared file type.";
                    return false;
                }
            }
            catch (FormatException)
            {
                error = "Avatar image data is invalid.";
                return false;
            }

            return true;
        }

        private static bool HasExpectedImageSignature(string mimeType, byte[] bytes)
        {
            return mimeType switch
            {
                "image/jpeg" => bytes.Length >= 3 &&
                    bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
                "image/png" => bytes.Length >= 8 &&
                    bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
                "image/webp" => bytes.Length >= 12 &&
                    bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) &&
                    bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8),
                _ => false
            };
        }
    }
}
