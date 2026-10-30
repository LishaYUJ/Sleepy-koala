using System.Globalization;
using SleepyKoala.Api.Models;

namespace SleepyKoala.Api.Services;

public sealed record SleepCalendarContext(
    DateOnly LocalDate,
    TimeSpan LocalTime,
    DateOnly CurrentSleepDate,
    DateOnly LastClosedSleepDate);

public interface ISleepCalendarService
{
    SleepCalendarContext GetContext(string localDate, string localTime);
    DateOnly GetTrackingStartSleepDate(UserSettings settings, SleepCalendarContext calendar);
    DateOnly GetInitialTrackingStartSleepDate(UserSettings settings, SleepCalendarContext calendar);
}

public sealed class SleepCalendarService : ISleepCalendarService
{
    private static readonly TimeSpan CheckInStart = new(21, 0, 0);
    private static readonly TimeSpan CheckInEnd = new(2, 0, 0);

    public SleepCalendarContext GetContext(string localDate, string localTime)
    {
        if (!DateOnly.TryParseExact(localDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date) || date.DayNumber < 2)
            throw new ArgumentException("LocalDate must be a valid date in yyyy-MM-dd format.");
        if (!TimeOnly.TryParseExact(localTime, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var time))
            throw new ArgumentException("LocalTime must be a valid time in HH:mm or HH:mm:ss format.");

        var local = time.ToTimeSpan();
        var current = local < CheckInStart ? date.AddDays(-1) : date;
        var lastClosed = local > CheckInEnd ? date.AddDays(-1) : date.AddDays(-2);
        return new SleepCalendarContext(date, local, current, lastClosed);
    }

    public DateOnly GetTrackingStartSleepDate(UserSettings settings, SleepCalendarContext calendar)
    {
        if (DateOnly.TryParseExact(settings.TrackingStartSleepDate, "yyyy-MM-dd", out var stored))
            return stored;
        // Without a saved local start date, UTC registration cannot recover the
        // original local date. Start conservatively when the device is next seen.
        return GetInitialTrackingStartSleepDate(settings, calendar);
    }

    public DateOnly GetInitialTrackingStartSleepDate(UserSettings settings, SleepCalendarContext calendar)
    {
        var cutoff = TimeSpan.TryParse(settings.CutoffTime, out var parsed)
            ? parsed : new TimeSpan(22, 0, 0);
        var bedtimeHasPassed = calendar.LocalTime >= CheckInStart
            && cutoff != TimeSpan.Zero && calendar.LocalTime > cutoff;
        return bedtimeHasPassed && calendar.LocalDate < DateOnly.MaxValue
            ? calendar.LocalDate.AddDays(1) : calendar.LocalDate;
    }
}
