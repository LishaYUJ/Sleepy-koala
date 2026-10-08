using System;
using System.ComponentModel.DataAnnotations;

namespace SleepyKoala.Api.DTOs
{
    public class RegisterRequest
    {
        public Guid RegistrationAttemptId { get; set; }

        [Required, EmailAddress, StringLength(320)]
        public required string Email { get; set; }
        
        [Required, MinLength(6)]
        public required string Password { get; set; }
        
        [Required, StringLength(50)]
        public required string Nickname { get; set; }
    }

    public class LoginRequest
    {
        [Required, EmailAddress, StringLength(320)]
        public required string Email { get; set; }
        
        [Required]
        public required string Password { get; set; }
    }

    public class AuthResponse
    {
        public Guid UserId { get; set; }
        public required string Email { get; set; }
        public required string Nickname { get; set; }
        public string? AvatarDataUrl { get; set; }
        public required string Token { get; set; }
    }
}
