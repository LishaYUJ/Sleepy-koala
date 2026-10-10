using System;
using System.Security.Claims;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.DTOs;
using SleepyKoala.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;

namespace SleepyKoala.Api.Services
{
    public interface IAuthService
    {
        Task<RegistrationResult> RegisterAsync(RegisterRequest request);
        Task<AuthResponse?> LoginAsync(LoginRequest request);
    }

    public enum RegistrationOutcome
    {
        Created,
        Replayed,
        UserExists,
        IdempotencyConflict
    }

    public sealed record RegistrationResult(RegistrationOutcome Outcome, AuthResponse? Response = null);

    public class AuthService : IAuthService
    {
        private readonly ApplicationDbContext _context;
        private readonly JwtSettings _jwtSettings;
        private readonly ILogger<AuthService> _logger;
        private readonly TimeProvider _timeProvider;

        public AuthService(
            ApplicationDbContext context,
            JwtSettings jwtSettings,
            ILogger<AuthService> logger,
            TimeProvider timeProvider)
        {
            _context = context;
            _jwtSettings = jwtSettings;
            _logger = logger;
            _timeProvider = timeProvider;
        }

        public async Task<RegistrationResult> RegisterAsync(RegisterRequest request)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var existingAttempt = await _context.Users.SingleOrDefaultAsync(
                u => u.RegistrationAttemptId == request.RegistrationAttemptId);

            if (existingAttempt != null)
            {
                if (MatchesRegistration(existingAttempt, request, normalizedEmail))
                {
                    _logger.LogInformation("RegistrationReplayed");
                    return new RegistrationResult(
                        RegistrationOutcome.Replayed,
                        CreateAuthResponse(existingAttempt));
                }

                _logger.LogWarning("RegistrationIdempotencyConflict");
                return new RegistrationResult(RegistrationOutcome.IdempotencyConflict);
            }

            if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail))
            {
                _logger.LogInformation("RegistrationUserAlreadyExists");
                return new RegistrationResult(RegistrationOutcome.UserExists);
            }

            var user = new User
            {
                Email = normalizedEmail,
                Nickname = request.Nickname,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                RegistrationAttemptId = request.RegistrationAttemptId,
                CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
            };
            
            var settings = new UserSettings
            {
                UserId = user.Id
            };
            user.Settings = settings;

            _context.Users.Add(user);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Another request with the same idempotency key or email may
                // have committed while this request was being processed.
                _context.ChangeTracker.Clear();

                existingAttempt = await _context.Users.SingleOrDefaultAsync(
                    u => u.RegistrationAttemptId == request.RegistrationAttemptId);
                if (existingAttempt != null)
                {
                    if (MatchesRegistration(existingAttempt, request, normalizedEmail))
                    {
                        _logger.LogInformation("RegistrationReplayedAfterConcurrentRequest");
                        return new RegistrationResult(
                            RegistrationOutcome.Replayed,
                            CreateAuthResponse(existingAttempt));
                    }

                    _logger.LogWarning("RegistrationIdempotencyConflictAfterConcurrentRequest");
                    return new RegistrationResult(RegistrationOutcome.IdempotencyConflict);
                }

                if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail))
                {
                    _logger.LogInformation("RegistrationUserAlreadyExistsAfterConcurrentRequest");
                    return new RegistrationResult(RegistrationOutcome.UserExists);
                }

                throw;
            }

            _logger.LogInformation("RegistrationCreated");
            return new RegistrationResult(RegistrationOutcome.Created, CreateAuthResponse(user));
        }

        public async Task<AuthResponse?> LoginAsync(LoginRequest request)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Email == normalizedEmail);
            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return null;
            }

            return CreateAuthResponse(user);
        }

        private static bool MatchesRegistration(
            User user,
            RegisterRequest request,
            string normalizedEmail)
        {
            return user.Email == normalizedEmail
                && user.Nickname == request.Nickname
                && BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
        }

        private AuthResponse CreateAuthResponse(User user)
        {
            var token = GenerateJwtToken(user);
            return new AuthResponse
            {
                UserId = user.Id,
                Email = user.Email,
                Nickname = user.Nickname,
                AvatarDataUrl = user.AvatarDataUrl,
                Token = token
            };
        }

        private string GenerateJwtToken(User user)
        {
            var credentials = new SigningCredentials(_jwtSettings.CreateSecurityKey(), SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim("nickname", user.Nickname)
            };

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
