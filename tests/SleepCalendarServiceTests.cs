using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Tests;

public class SleepCalendarServiceTests
{
    private static UserSettings Settings() => new();

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
        var service = new SleepCalendarService();

        var context = service.GetContext("2026-07-17", $"{hour:D2}:{minute:D2}");

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
        var service = new SleepCalendarService();

        var result = service.GetTrackingStartSleepDate(Settings(), service.GetContext("2026-07-17", $"{hour:D2}:{minute:D2}"));

        Assert.Equal(expectedStart, result.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public void Tracking_UsesAStoredOnboardingDateWhenAvailable()
    {
        var settings = Settings();
        settings.TrackingStartSleepDate = "2026-07-20";
        var service = new SleepCalendarService();

        var result = service.GetTrackingStartSleepDate(
            settings,
            service.GetContext("2026-07-17", "01:00"));

        Assert.Equal("2026-07-20", result.ToString("yyyy-MM-dd"));
    }

    [Theory]
    [InlineData("2026-02-30", "22:00")]
    [InlineData("2026-07-17", "25:00")]
    [InlineData("2026-07-17", "1.00:00:00")]
    [InlineData("", "22:00")]
    [InlineData("2026-07-17", "")]
    public void Context_RejectsInvalidDeviceClock(string date, string time)
    {
        Assert.Throws<ArgumentException>(() => new SleepCalendarService().GetContext(date, time));
    }
}
