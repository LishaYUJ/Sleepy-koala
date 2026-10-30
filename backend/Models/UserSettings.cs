using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SleepyKoala.Api.Models
{
    public class UserSettings
    {
        [Key]
        public Guid UserId { get; set; }
        
        [ForeignKey("UserId")]
        public User? User { get; set; }

        public string CutoffTime { get; set; } = "22:00"; // default 10 PM
        public bool OnboardingCompleted { get; set; }
        public string? TrackingStartSleepDate { get; set; }
    }
}
