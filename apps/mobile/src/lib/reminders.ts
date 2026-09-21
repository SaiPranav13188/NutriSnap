import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local reminders: a nudge to log dinner, and a weekly weigh-in prompt.
 *
 * Local only — nothing is scheduled on a server and no push token is
 * registered. Everything here is an alarm the phone sets for itself.
 *
 * The awkward part is that expo-notifications cannot be imported at all in
 * Expo Go on Android. Its index pulls in DevicePushTokenAutoRegistration,
 * which registers a push-token listener as a side effect of being loaded, and
 * since SDK 53 that throws in Expo Go — before any of this code runs, and
 * whether or not push is ever used. A static import therefore takes down every
 * screen that imports this file.
 *
 * So the module is loaded lazily, only once something actually needs it, and
 * only outside Expo Go. `remindersSupported` lets the UI say why the toggles
 * are off rather than offering a switch that cannot work.
 */

/**
 * True in a development or production build, false in Expo Go.
 *
 * `appOwnership` is deprecated in favour of `executionEnvironment`, but
 * executionEnvironment reports "storeClient" for Expo Go AND for a dev client,
 * which is exactly the distinction that matters here. appOwnership is the only
 * signal that separates the two.
 */
export const remindersSupported = Constants.appOwnership !== 'expo';

type NotificationsModule = typeof import('expo-notifications');

let modulePromise: Promise<NotificationsModule | null> | null = null;

/**
 * Load expo-notifications, or return null where it cannot be loaded.
 *
 * The try/catch is not redundant with the Expo Go check: it is the backstop
 * for any other environment where importing the module throws, so a reminder
 * toggle can never crash the app the way a static import did.
 */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!remindersSupported) return null;

  modulePromise ??= import('expo-notifications')
    .then((mod) => {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      return mod;
    })
    .catch(() => null);

  return modulePromise;
}

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
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

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
 *
 * Returns false when the reminders could not be scheduled, so the caller can
 * put the toggle back down instead of promising something that will not come.
 */
export async function applyReminders(settings: ReminderSettings): Promise<boolean> {
  const wantsAny = settings.mealEnabled || settings.weighInEnabled;

  // Turning everything off is worth persisting even where scheduling is
  // impossible, so the stored preference matches what the user chose.
  if (!wantsAny) {
    const Notifications = await loadNotifications();
    if (Notifications) {
      await Notifications.cancelScheduledNotificationAsync(MEAL_REMINDER_ID).catch(() => {});
      await Notifications.cancelScheduledNotificationAsync(WEIGH_IN_REMINDER_ID).catch(() => {});
    }
    await storeReminderSettings(settings);
    return true;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  if (!(await ensurePermission())) return false;

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
  const Notifications = await loadNotifications();
  if (!Notifications) return 0;

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length;
  } catch {
    return 0;
  }
}
