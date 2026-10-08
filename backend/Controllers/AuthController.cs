using Microsoft.AspNetCore.Mvc;
using SleepyKoala.Api.DTOs;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;

        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterRequest request)
        {
            if (request.RegistrationAttemptId == Guid.Empty)
            {
                return BadRequest(new
                {
                    error = "RegistrationAttemptRequired",
                    message = "A registration attempt ID is required."
                });
            }

            var result = await _authService.RegisterAsync(request);
            return result.Outcome switch
            {
                RegistrationOutcome.Created => Ok(result.Response),
                RegistrationOutcome.Replayed => Ok(result.Response),
                RegistrationOutcome.UserExists => Conflict(new
                {
                    error = "UserExists",
                    message = "An account with this email already exists. Try signing in instead."
                }),
                RegistrationOutcome.IdempotencyConflict => Conflict(new
                {
                    error = "IdempotencyConflict",
                    message = "This registration attempt was already used with different details."
                }),
                _ => StatusCode(StatusCodes.Status500InternalServerError)
            };
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            var result = await _authService.LoginAsync(request);
            if (result == null) return Unauthorized(new { error = "InvalidCredentials", message = "Invalid email or password." });
            return Ok(result);
        }
    }
}
