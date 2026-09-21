import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local reminders: a nudge to log dinner, and a weekly weigh-in prompt.
 *
 * Local only — nothing is scheduled on a server and no push token is
 * registered. Everything here is an alarm the phone sets for itself, which is
 * the whole requirement: "remind me at 8pm" needs no backend.
 *
 * Expo Go caveat: remote push was removed from Expo Go on Android, and local
 * scheduled notifications are the part that still works there. They are fully
 * reliable in a development build. `ensurePermission` returning false is the
 * honest signal when the environment cannot deliver them.
 */

const MEAL_REMINDER_ID = 'nutrisnap.reminder.meal';
const WEIGH_IN_REMINDER_ID = 'nutrisnap.reminder.weighin';

const STORAGE_KEY = 'nutrisnap.reminders.v1';

export interface ReminderSettings {
  mealEnabled: boolean;
  /** 24-hour clock. */
  mealHour: number;
  weighInEnabled: boolean;
  weighInHour: number;
  /** 1 = Sunday, matching expo-notifications' weekday numbering. */
  weighInWeekday: number;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  mealEnabled: false,
  mealHour: 20,
  weighInEnabled: false,
  weighInHour: 8,
  weighInWeekday: 2, // Monday
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function readReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDERS;
    return { ...DEFAULT_REMINDERS, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

async function storeReminderSettings(settings: ReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The schedule is already set on the OS; losing the preference only means
    // the toggle reads wrong next launch, which resyncing will correct.
  }
}

/** Ask once, and report honestly if the answer is no. */
export async function ensurePermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Apply the settings to the OS schedule.
 *
 * Cancels first and re-creates rather than trying to patch: the set is two
 * alarms, so rebuilding is cheaper than reasoning about what changed, and it
 * cannot leave an orphan firing at the old time.
 */
export async function applyReminders(settings: ReminderSettings): Promise<boolean> {
  const needsPermission = settings.mealEnabled || settings.weighInEnabled;

  if (needsPermission && !(await ensurePermission())) {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelScheduledNotificationAsync(MEAL_REMINDER_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(WEIGH_IN_REMINDER_ID).catch(() => {});

  if (settings.mealEnabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: MEAL_REMINDER_ID,
      content: {
        title: 'Log your day',
        body: 'Anything still to add before the day closes?',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.mealHour,
        minute: 0,
        channelId: 'reminders',
      },
    });
  }

  if (settings.weighInEnabled) {
    await Notifications.scheduleNotificationAsync({
      identifier: WEIGH_IN_REMINDER_ID,
      content: {
        title: 'Weigh-in day',
        body: 'Step on the scale before breakfast for the steadiest reading.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: settings.weighInWeekday,
        hour: settings.weighInHour,
        minute: 0,
        channelId: 'reminders',
      },
    });
  }

  await storeReminderSettings(settings);
  return true;
}

/** What the OS actually has scheduled — used to verify, not to guess. */
export async function scheduledCount(): Promise<number> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
  } catch {
    return 0;
  }
}
