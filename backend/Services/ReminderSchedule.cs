using System.Globalization;
using SleepyKoala.Api.Models;

namespace SleepyKoala.Api.Services;

public record DueReminder(string SleepDate, string Kind, string Body);

public static class ReminderSchedule
{
    // A brief outage may be recovered, but never send an old bedtime reminder in the morning.
    public static DueReminder? GetDue(PushDevice device, string cutoff, DateTimeOffset utcNow)
    {
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(device.TimeZoneId); }
        catch (TimeZoneNotFoundException) { return null; }
        catch (InvalidTimeZoneException) { return null; }
        if (!TimeOnly.TryParseExact(cutoff, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var bedtime)) return null;
        var local = TimeZoneInfo.ConvertTime(utcNow, zone);
        var minute = local.TimeOfDay.TotalMinutes;
        var windDown = (bedtime == TimeOnly.MinValue ? 1440 : bedtime.Hour * 60 + bedtime.Minute) - 30;
        var opening = 21 * 60;
        // Combine reminders less than 15 minutes apart at the earlier time.
        var merged = device.OpeningReminder && device.WindDownReminder && Math.Abs(windDown - opening) < 15;
        var dueAt = merged ? Math.Min(opening, windDown) : -1;
        string? kind = null;
        if (merged && minute >= dueAt && minute < dueAt + 5) kind = "combined";
        else if (!merged && device.WindDownReminder && minute >= windDown && minute < windDown + 5) kind = "windDown";
        else if (!merged && device.OpeningReminder && minute >= opening && minute < opening + 5) kind = "opening";
        if (kind == null) return null;
        var body = kind == "opening"
            ? "Tonight’s check-in is open. Say goodnight to your koala when you’re ready to sleep."
            : "Your bedtime goal is about 30 minutes away. Take a quiet moment to wind down.";
        return new(local.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), kind, body);
    }
}
