using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Tests;

public class SleepCalendarServiceTests
{
    private static UserSettings UtcSettings() => new() { TimeZoneId = "UTC" };

    [Theory]
    [InlineData(1, 59, "2026-07-16", "2026-07-15")]
    [InlineData(2, 0, "2026-07-16", "2026-07-15")]
    [InlineData(2, 1, "2026-07-16", "2026-07-16")]
    [InlineData(20, 59, "2026-07-16", "2026-07-16")]
    [InlineData(21, 0, "2026-07-17", "2026-07-16")]
    public void Context_ClosesASleepDayOnlyAfterTwoAm(
        int hour,
        int minute,
        string expectedCurrent,
        string expectedLastClosed)
    {
        var now = new DateTimeOffset(2026, 7, 17, hour, minute, 0, TimeSpan.Zero);
        var service = new SleepCalendarService(new FixedTimeProvider(now));

        var context = service.GetContext(UtcSettings());

        Assert.Equal(expectedCurrent, context.CurrentSleepDate.ToString("yyyy-MM-dd"));
        Assert.Equal(expectedLastClosed, context.LastClosedSleepDate.ToString("yyyy-MM-dd"));
    }

    [Theory]
    [InlineData(0, 30, "2026-07-17")]
    [InlineData(2, 0, "2026-07-17")]
    [InlineData(2, 1, "2026-07-17")]
    [InlineData(20, 59, "2026-07-17")]
    [InlineData(21, 0, "2026-07-17")]
    [InlineData(22, 0, "2026-07-17")]
    [InlineData(22, 1, "2026-07-18")]
    [InlineData(23, 30, "2026-07-18")]
    public void Tracking_DoesNotInferAMissWhenSetupHappensAfterBedtime(
        int hour,
        int minute,
        string expectedStart)
    {
        var startedAt = new DateTime(2026, 7, 17, hour, minute, 0, DateTimeKind.Utc);
        var service = new SleepCalendarService(new FixedTimeProvider(new DateTimeOffset(startedAt)));

        var result = service.GetTrackingStartSleepDate(UtcSettings(), startedAt);

        Assert.Equal(expectedStart, result.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public void Tracking_UsesAStoredOnboardingDateWhenAvailable()
    {
        var settings = UtcSettings();
        settings.TrackingStartSleepDate = "2026-07-20";
        var service = new SleepCalendarService(
            new FixedTimeProvider(new DateTimeOffset(2026, 7, 17, 1, 0, 0, TimeSpan.Zero)));

        var result = service.GetTrackingStartSleepDate(
            settings,
            new DateTime(2026, 7, 17, 1, 0, 0, DateTimeKind.Utc));

        Assert.Equal("2026-07-20", result.ToString("yyyy-MM-dd"));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
