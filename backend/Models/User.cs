using System;
using System.Collections.Generic;

namespace SleepyKoala.Api.Models
{
    public class User
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public required string Email { get; set; }
        public required string PasswordHash { get; set; }
        public required string Nickname { get; set; }
        public string? AvatarDataUrl { get; set; }
        public Guid? RegistrationAttemptId { get; set; }
        
        public int CurrentStreak { get; set; } = 0;
        public int LongestStreak { get; set; } = 0;
        
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public UserSettings? Settings { get; set; }
        public ICollection<CheckIn> CheckIns { get; set; } = new List<CheckIn>();
        public ICollection<UserBadge> UserBadges { get; set; } = new List<UserBadge>();
    }
}
