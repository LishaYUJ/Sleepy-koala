using SleepyKoala.Api.Models;

namespace SleepyKoala.Api.Services;

public sealed record SleepCalendarContext(
    DateOnly LocalDate,
    TimeSpan LocalTime,
    DateOnly CurrentSleepDate,
    DateOnly LastClosedSleepDate);

public interface ISleepCalendarService
{
    SleepCalendarContext GetContext(UserSettings settings);
    DateOnly GetTrackingStartSleepDate(UserSettings settings, DateTime startedAtUtc);
    DateOnly GetInitialTrackingStartSleepDate(UserSettings settings, DateTime startedAtUtc);
    bool IsValidTimeZone(string timeZoneId);
}

public sealed class SleepCalendarService : ISleepCalendarService
{
    private static readonly TimeSpan CheckInStart = new(21, 0, 0);
    private static readonly TimeSpan CheckInEnd = new(2, 0, 0);
    private readonly TimeProvider _timeProvider;

    public SleepCalendarService(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    public SleepCalendarContext GetContext(UserSettings settings)
    {
        var timeZone = ResolveTimeZone(settings.TimeZoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(_timeProvider.GetUtcNow().UtcDateTime, timeZone);
        var localDate = DateOnly.FromDateTime(localNow);
        var localTime = localNow.TimeOfDay;
        var currentSleepDate = localTime < CheckInStart ? localDate.AddDays(-1) : localDate;
        var lastClosedSleepDate = localTime > CheckInEnd ? localDate.AddDays(-1) : localDate.AddDays(-2);

        return new SleepCalendarContext(localDate, localTime, currentSleepDate, lastClosedSleepDate);
    }

    public DateOnly GetTrackingStartSleepDate(UserSettings settings, DateTime startedAtUtc)
    {
        if (DateOnly.TryParseExact(settings.TrackingStartSleepDate, "yyyy-MM-dd", out var storedDate))
        {
            return storedDate;
        }

        return GetInitialTrackingStartSleepDate(settings, startedAtUtc);
    }

    public DateOnly GetInitialTrackingStartSleepDate(UserSettings settings, DateTime startedAtUtc)
    {

        var timeZone = ResolveTimeZone(settings.TimeZoneId);
        var utc = startedAtUtc.Kind == DateTimeKind.Utc
            ? startedAtUtc
            : DateTime.SpecifyKind(startedAtUtc, DateTimeKind.Utc);
        var localStartedAt = TimeZoneInfo.ConvertTimeFromUtc(utc, timeZone);
        var startDate = DateOnly.FromDateTime(localStartedAt);
        var localTime = localStartedAt.TimeOfDay;
        var cutoffTime = TimeSpan.TryParse(settings.CutoffTime, out var parsedCutoff)
            ? parsedCutoff
            : new TimeSpan(22, 0, 0);

        // Completing setup after the personal bedtime must not immediately create
        // a missed night. The user can still actively check in late for the open
        // sleep day, but inferred absences begin with the next bedtime instead.
        var bedtimeHasPassedThisEvening = localTime >= CheckInStart
            && cutoffTime != TimeSpan.Zero
            && localTime > cutoffTime;

        return bedtimeHasPassedThisEvening ? startDate.AddDays(1) : startDate;
    }

    public bool IsValidTimeZone(string timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId)) return false;
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
        catch (InvalidTimeZoneException)
        {
            return false;
        }
    }

    private static TimeZoneInfo ResolveTimeZone(string timeZoneId)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc;
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }
}
