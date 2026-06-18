export const SUPPORT_NOTICE_DISMISSED_KEY = 'hubplanner:support-notice-dismissed-v2';
export const DATA_INCIDENT_NOTICE_DISMISSED_KEY = 'hubplanner:data-incident-notice-dismissed';

const PRESERVED_DEVICE_PREFERENCE_KEYS = [SUPPORT_NOTICE_DISMISSED_KEY, DATA_INCIDENT_NOTICE_DISMISSED_KEY];

export const clearLocalStoragePreservingDevicePreferences = () => {
    const preservedEntries = PRESERVED_DEVICE_PREFERENCE_KEYS
        .map((key) => [key, localStorage.getItem(key)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== null);

    localStorage.clear();

    preservedEntries.forEach(([key, value]) => {
        localStorage.setItem(key, value);
    });
};

export const removeLocalStorageExceptDevicePreferences = (shouldRemove: (key: string) => boolean) => {
    Object.keys(localStorage).forEach((key) => {
        if (PRESERVED_DEVICE_PREFERENCE_KEYS.includes(key)) return;
        if (shouldRemove(key)) localStorage.removeItem(key);
    });
};
