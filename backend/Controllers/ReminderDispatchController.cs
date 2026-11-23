using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Api.Controllers;

// Called only by the independent scheduler, never by the frontend.
[ApiController, Route("api/internal/reminders/dispatch")]
public sealed class ReminderDispatchController(WebPushSettings settings, ReminderDispatcher dispatcher) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Dispatch(CancellationToken ct)
    {
        if (!settings.Enabled || settings.DispatchKey.Length < 32) return NotFound();
        var supplied = Request.Headers["X-Reminder-Key"].ToString();
        if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(supplied)),
            SHA256.HashData(Encoding.UTF8.GetBytes(settings.DispatchKey)))) return Unauthorized();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(45));
        await dispatcher.DispatchAsync(timeout.Token);
        return NoContent();
    }
}
