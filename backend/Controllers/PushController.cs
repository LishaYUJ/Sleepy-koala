using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Extensions;
using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Api.Controllers;

public sealed record EndpointRequest([Required, MaxLength(2048)] string Endpoint);
public sealed record SubscribeRequest(
    [Required, MaxLength(2048)] string Endpoint,
    [Required, MaxLength(100)] string P256dh,
    [Required, MaxLength(32)] string Auth,
    [Required, MaxLength(100)] string TimeZoneId);
public sealed record TimeZoneRequest([Required, MaxLength(100)] string TimeZoneId);

[ApiController, Authorize, Route("api/push")]
public sealed class PushController(ApplicationDbContext db, WebPushSettings settings,
    IWebPushSender sender, TimeProvider clock) : ControllerBase
{
    [HttpGet("config")]
    public IActionResult Config() => Ok(new { enabled = settings.Enabled, publicKey = settings.Enabled ? settings.PublicKey : null });

    [HttpPost("device")]
    public async Task<IActionResult> GetDevice(EndpointRequest request)
    {
        var hash = Hash(request.Endpoint);
        var device = await db.PushDevices.AsNoTracking().SingleOrDefaultAsync(d => d.EndpointHash == hash && d.UserId == User.GetUserId());
        return Ok(new { device = device == null ? null : View(device) });
    }

    [HttpPut("device")]
    public async Task<IActionResult> Subscribe(SubscribeRequest request)
    {
        if (!settings.Enabled) return StatusCode(503, new { message = "Sleep reminders are not available yet. Please try again later." });
        var userId = User.GetUserId();
        if (userId == null) return Unauthorized();
        if (!IsSafeEndpoint(request.Endpoint) || !ValidKeys(request.P256dh, request.Auth))
            return BadRequest(new { message = "This browser returned an unsupported push subscription." });
        if (!ValidTimeZone(request.TimeZoneId)) return BadRequest(new { message = "Your reminder time zone was not recognised." });
        if (!await db.Users.AnyAsync(u => u.Id == userId)) return Unauthorized();
        var hash = Hash(request.Endpoint);
        var device = await db.PushDevices.SingleOrDefaultAsync(d => d.EndpointHash == hash);
        if (device != null && device.UserId != userId)
            return Conflict(new { message = "This browser is subscribed to another account. Reset this device’s notifications and try again." });
        if (device == null)
        {
            if (await db.PushDevices.CountAsync(d => d.UserId == userId) >= 10)
                return BadRequest(new { message = "You have reached the limit of 10 notification devices." });
            device = new PushDevice { UserId = userId.Value, Endpoint = request.Endpoint, EndpointHash = hash,
                P256dh = request.P256dh, Auth = request.Auth, TimeZoneId = request.TimeZoneId };
            db.PushDevices.Add(device);
        }
        device.P256dh = request.P256dh;
        device.Auth = request.Auth;
        device.TimeZoneId = request.TimeZoneId;
        device.OpeningReminder = true;
        device.WindDownReminder = true;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            return Conflict(new { message = "Notification settings changed in another tab. Reload and try again." });
        }
        return Ok(View(device));
    }

    [HttpPut("devices/{id:guid}/timezone")]
    public async Task<IActionResult> UpdateTimeZone(Guid id, TimeZoneRequest request)
    {
        if (!ValidTimeZone(request.TimeZoneId)) return BadRequest(new { message = "Unknown time zone." });
        var updated = await db.PushDevices.Where(d => d.Id == id && d.UserId == User.GetUserId())
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.TimeZoneId, request.TimeZoneId));
        return updated == 0 ? NotFound() : NoContent();
    }

    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe(EndpointRequest request)
    {
        var hash = Hash(request.Endpoint);
        await db.PushDevices.Where(d => d.EndpointHash == hash && d.UserId == User.GetUserId()).ExecuteDeleteAsync();
        return NoContent();
    }

    [HttpPost("devices/{id:guid}/test")]
    public async Task<IActionResult> Test(Guid id, CancellationToken ct)
    {
        if (!settings.Enabled) return StatusCode(503, new { message = "Sleep reminders are not available yet." });
        var device = await db.PushDevices.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id && d.UserId == User.GetUserId(), ct);
        if (device == null) return NotFound();
        var now = clock.GetUtcNow().UtcDateTime;
        var earliest = now.AddMinutes(-1);
        var claimed = await db.PushDevices.Where(d => d.Id == id && (d.LastTestAtUtc == null || d.LastTestAtUtc < earliest))
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.LastTestAtUtc, now), ct);
        if (claimed == 0) return StatusCode(429, new { message = "Please wait a minute before sending another test." });
        // A new test must not silently replace a previous notification after the user
        // changes system permissions. Scheduled reminders still use stable deduplication tags.
        var testTag = $"test-{Guid.NewGuid():N}"[..32];
        var result = await sender.SendAsync(device, "You’re all set. Your koala can remind you when it’s time to wind down.", testTag, ct);
        if (result == PushResult.Expired)
        {
            await db.PushDevices.Where(d => d.Id == id).ExecuteDeleteAsync(ct);
            return StatusCode(410, new { message = "This subscription has expired. Turn reminders off, then enable them again." });
        }
        if (result != PushResult.Sent) return StatusCode(502, new { message = "The notification service could not accept the test. Please try again shortly." });
        return Ok(new { message = "Test sent. Check your device’s notifications." });
    }

    private static object View(PushDevice device) => new { device.Id, device.OpeningReminder, device.WindDownReminder, device.TimeZoneId };
    private static string Hash(string endpoint) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint)));

    public static bool IsSafeEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
            uri.Port != 443 || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0) return false;
        // A subscription is client input: never let it turn our sender into an arbitrary HTTP proxy.
        var host = uri.IdnHost.ToLowerInvariant();
        return host == "fcm.googleapis.com" || host == "updates.push.services.mozilla.com" ||
            host == "web.push.apple.com" || host.EndsWith(".push.apple.com", StringComparison.Ordinal) ||
            host.EndsWith(".notify.windows.com", StringComparison.Ordinal);
    }

    private static bool ValidTimeZone(string id)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(id); return true; }
        catch (TimeZoneNotFoundException) { return false; }
        catch (InvalidTimeZoneException) { return false; }
    }

    private static bool ValidKeys(string p256dh, string auth)
    {
        try
        {
            var bytes = WebEncoders.Base64UrlDecode(p256dh);
            if (bytes.Length != 65 || bytes[0] != 4 || WebEncoders.Base64UrlDecode(auth).Length != 16) return false;
            using var key = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = bytes[1..33], Y = bytes[33..65] } });
            return true;
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException or ArgumentException) { return false; }
    }
}
