using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace SleepyKoala.Api.DTOs
{
    public class CheckInRequest
    {
        [Required]
        public required string LocalDate { get; set; }

        [Required]
        public required string LocalTime { get; set; }
    }

    public class CheckInResponse
    {
        public Guid CheckInId { get; set; }
        public required string Status { get; set; }
        public required string LocalCheckInDate { get; set; }
        public int CurrentStreak { get; set; }
        public required string KoalaMood { get; set; }
        public List<string> UnlockedBadges { get; set; } = new List<string>();
    }

    public class CheckInHistoryDto
    {
        public Guid? Id { get; set; }
        public required string LocalCheckInDate { get; set; }
        public required string Status { get; set; }
        public bool Recorded { get; set; }
        public DateTime? CheckedInAtUtc { get; set; }
    }
}
