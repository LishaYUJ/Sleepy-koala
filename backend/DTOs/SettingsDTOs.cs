using System.ComponentModel.DataAnnotations;

namespace SleepyKoala.Api.DTOs
{
    public class SettingsDto
    {
        [Required, StringLength(50)]
        public required string Nickname { get; set; }
        
        [Required]
        public required string CutoffTime { get; set; }
        
        public bool OnboardingCompleted { get; set; }

        [StringLength(700000)]
        public string? AvatarDataUrl { get; set; }
    }

    public class UpdateSettingsRequest : SettingsDto
    {
        // Supplied by the device when settings are saved; never persisted as a timezone.
        [Required]
        public string LocalDate { get; set; } = string.Empty;

        [Required]
        public string LocalTime { get; set; } = string.Empty;

    }

}
