using System.Net;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Controllers;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Tests;

public class WebPushReminderTests
{
    private static PushDevice Device(string zone = "UTC") => new()
    {
        Endpoint = "https://web.push.apple.com/test", EndpointHash = Guid.NewGuid().ToString(),
        P256dh = "key", Auth = "auth", TimeZoneId = zone, OpeningReminder = true, WindDownReminder = true
    };

    [Theory]
    [InlineData("22:00", "2026-11-02T21:00:00Z", "opening")]
    [InlineData("22:00", "2026-11-02T21:30:00Z", "windDown")]
    [InlineData("22:00", "2026-11-02T21:34:59Z", "windDown")]
    [InlineData("22:00", "2026-11-02T21:35:00Z", null)]
    [InlineData("22:00", "2026-11-02T21:29:59Z", null)]
    [InlineData("00:00", "2026-11-02T23:30:00Z", "windDown")]
    [InlineData("00:00", "2026-11-03T00:00:00Z", null)]
    [InlineData("21:00", "2026-11-02T20:30:00Z", "windDown")]
    [InlineData("21:30", "2026-11-02T21:00:00Z", "combined")]
    [InlineData("21:40", "2026-11-02T21:10:00Z", null)]
    [InlineData("21:20", "2026-11-02T20:50:00Z", "combined")]
    [InlineData("21:20", "2026-11-02T21:00:00Z", null)]
    public void ScheduleHonoursBoundariesAndMerges(string cutoff, string now, string? kind)
    {
        var due = ReminderSchedule.GetDue(Device(), cutoff, DateTimeOffset.Parse(now));
        Assert.Equal(kind, due?.Kind);
        if (due != null) Assert.Equal("2026-11-02", due.SleepDate);
    }

    [Theory]
    [InlineData("2026-07-02T09:00:00Z", "2026-07-02")]
    [InlineData("2026-11-02T08:00:00Z", "2026-11-02")]
    public void AucklandUsesSeasonalOffset(string now, string date)
    {
        var due = ReminderSchedule.GetDue(Device("Pacific/Auckland"), "22:00", DateTimeOffset.Parse(now));
        Assert.Equal("opening", due?.Kind);
        Assert.Equal(date, due?.SleepDate);
    }

    [Fact]
    public void DisabledChoicesAndBadZoneDoNotSend()
    {
        var device = Device();
        device.OpeningReminder = false;
        device.WindDownReminder = false;
        Assert.Null(ReminderSchedule.GetDue(device, "21:30", DateTimeOffset.Parse("2026-11-02T21:00:00Z")));
        device = Device("not/a-zone");
        Assert.Null(ReminderSchedule.GetDue(device, "22:00", DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData("https://web.push.apple.com/token", true)]
    [InlineData("https://fcm.googleapis.com/send/token", true)]
    [InlineData("https://updates.push.services.mozilla.com/wpush/token", true)]
    [InlineData("http://web.push.apple.com/token", false)]
    [InlineData("https://127.0.0.1/admin", false)]
    [InlineData("https://web.push.apple.com.evil.test/token", false)]
    [InlineData("https://web.push.apple.com:8443/token", false)]
    [InlineData("https://name@web.push.apple.com/token", false)]
    public void SenderOnlyAcceptsKnownPushServices(string endpoint, bool expected) =>
        Assert.Equal(expected, PushController.IsSafeEndpoint(endpoint));

    [Fact]
    public async Task DispatcherDeduplicatesSkipsCheckInsAndCascadesAccountDeletion()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var user = new User { Email = "push@example.test", Nickname = "Koala", PasswordHash = "test" };
        user.Settings = new UserSettings { UserId = user.Id, CutoffTime = "22:00", OnboardingCompleted = true };
        var device = Device(); device.UserId = user.Id;
        db.Users.Add(user); db.PushDevices.Add(device); await db.SaveChangesAsync();
        var clock = new MovingClock(DateTimeOffset.Parse("2026-11-02T21:00:00Z"));
        var sender = new FakeSender();
        var dispatcher = new ReminderDispatcher(db, sender, clock);
        await dispatcher.DispatchAsync(default);
        await dispatcher.DispatchAsync(default);
        Assert.Equal(1, sender.Count);
        db.CheckIns.Add(new CheckIn { UserId = user.Id, LocalCheckInDate = "2026-11-02", Status = "onTime" });
        await db.SaveChangesAsync();
        clock.Now = clock.Now.AddMinutes(30);
        await dispatcher.DispatchAsync(default);
        Assert.Equal(1, sender.Count);
        db.Users.Remove(user); await db.SaveChangesAsync();
        Assert.Empty(await db.PushDevices.ToListAsync());
        Assert.Empty(await db.PushDeliveries.ToListAsync());
    }

    [Fact]
    public async Task DispatcherRetriesTransientFailureAndRemovesExpiredSubscription()
    {
        using var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var user = new User { Email = "retry@example.test", Nickname = "Koala", PasswordHash = "test" };
        user.Settings = new UserSettings { UserId = user.Id, CutoffTime = "22:00", OnboardingCompleted = true };
        var device = Device(); device.UserId = user.Id;
        db.Users.Add(user); db.PushDevices.Add(device); await db.SaveChangesAsync();
        var clock = new MovingClock(DateTimeOffset.Parse("2026-11-02T21:00:00Z"));
        var sender = new FakeSender { Result = PushResult.Retry };
        var dispatcher = new ReminderDispatcher(db, sender, clock);
        await dispatcher.DispatchAsync(default);
        await dispatcher.DispatchAsync(default);
        Assert.Equal(1, sender.Count);
        clock.Now = clock.Now.AddSeconds(91);
        sender.Result = PushResult.Expired;
        await dispatcher.DispatchAsync(default);
        Assert.Equal(2, sender.Count);
        Assert.Empty(await db.PushDevices.ToListAsync());
    }

    [Fact]
    public async Task SenderUsesModernEncryptionShortTtlAndVapidWithoutSendingRealNotification()
    {
        using var vapid = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = vapid.ExportParameters(true);
        var publicBytes = new byte[] { 4 }.Concat(parameters.Q.X!).Concat(parameters.Q.Y!).ToArray();
        var settings = new WebPushSettings { Enabled = true, Subject = "mailto:test@example.test",
            PublicKey = WebEncoders.Base64UrlEncode(publicBytes), PrivateKey = WebEncoders.Base64UrlEncode(parameters.D!) };
        settings.Validate();
        var device = Device();
        device.P256dh = settings.PublicKey;
        device.Auth = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(16));
        using var http = new HttpClient(new InspectPushHandler());
        var sender = new WebPushSender(http, settings, NullLogger<WebPushSender>.Instance);
        Assert.Equal(PushResult.Sent, await sender.SendAsync(device, "Wind down", "bedtime-test", default));
    }

    private sealed class InspectPushHandler : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Contains("aes128gcm", request.Content!.Headers.ContentEncoding);
            Assert.Equal("300", request.Headers.GetValues("TTL").Single());
            Assert.StartsWith("vapid ", request.Headers.GetValues("Authorization").Single());
            Assert.DoesNotContain("Wind down", await request.Content.ReadAsStringAsync(ct));
            return new HttpResponseMessage(HttpStatusCode.Created);
        }
    }
    private sealed class MovingClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class FakeSender : IWebPushSender
    {
        public int Count { get; private set; }
        public PushResult Result { get; set; } = PushResult.Sent;
        public Task<PushResult> SendAsync(PushDevice device, string body, string tag, CancellationToken ct)
        { Count++; return Task.FromResult(Result); }
    }
}
