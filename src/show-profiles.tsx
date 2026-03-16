import { ActionPanel, Action, Icon, List, Image, showToast, Toast, open } from "@raycast/api";
import { execAwsm, getDefaultBrowserBundleId, openUrlWithBundleId, FIREFOX_BUNDLE_IDS } from "./shared";
import { useEffect, useState } from "react";

const ITEMS = Array.from(Array(3).keys()).map((key) => {
  return {
    id: key,
    icon: Icon.Bird,
    title: "Title " + key,
    subtitle: "Subtitle",
    accessory: "Accessory",
  };
});

interface Profile {
  name: string;
  type: string;
  region: string;
  account_id: string;
  sso_account_id: string;
  sso_role_name: string;
  sso_session: string;
  is_active: boolean;
}

export default function Command() {
  const [data, setData] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>(undefined);

  const loadProfiles = () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = execAwsm("profile list -j");
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const profiles: Profile[] | undefined = data
    ? (() => {
        try {
          return JSON.parse(data);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  useEffect(() => {
    if (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load profiles",
        message: String(error),
      });
    }
  }, [error]);

  const setProfile = async (profile: Profile): Promise<boolean> => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Setting profile...",
    });

    try {
      execAwsm(`profile set ${profile.name}`);
      loadProfiles(); // Refresh list to show new active profile
      toast.style = Toast.Style.Success;
      toast.title = "Profile set";
      toast.message = profile.name;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to set profile";
      toast.message = String(error);
      return false;
    }
  };

  const openConsole = async (profile: Profile) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Opening console...",
    });

    try {
      const result = execAwsm(`console -n -p ${profile.name}`);
      const defaultBrowser = getDefaultBrowserBundleId();
      const isFirefoxDefault = defaultBrowser && FIREFOX_BUNDLE_IDS.includes(defaultBrowser);

      if (isFirefoxDefault) {
        const containerUrl = `ext+container:name=${encodeURIComponent(profile.name)}&url=${encodeURIComponent(result)}`;
        const bundleId = defaultBrowser as string;
        openUrlWithBundleId(containerUrl, bundleId);
      } else {
        open(result);
      }
      toast.hide();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to open console";
      toast.message = String(error);
    }
  };

  const getFirefoxBundleId = (): string | undefined => {
    const defaultBrowser = getDefaultBrowserBundleId();
    if (defaultBrowser && FIREFOX_BUNDLE_IDS.includes(defaultBrowser)) {
      return defaultBrowser;
    }
    // Try to find any installed Firefox version
    // On macOS, we can check if the app exists, but for simplicity we can try the first one
    // or assume org.mozilla.firefox is common.
    // Ideally we should verify installation, but Raycast openUrlWithBundleId will fail gracefully or we can catch it.
    return "org.mozilla.firefox";
  };

  const openInFirefoxContainer = async (profile: Profile) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Opening in Firefox Container...",
    });

    try {
      const result = execAwsm(`console -n -p ${profile.name}`);
      const firefoxId = getFirefoxBundleId();

      if (firefoxId) {
        const containerUrl = `ext+container:name=${encodeURIComponent(profile.name)}&url=${encodeURIComponent(result)}`;
        openUrlWithBundleId(containerUrl, firefoxId);
        toast.hide();
      } else {
        throw new Error("Firefox not found");
      }
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to open in Firefox";
      toast.message = String(error);
    }
  };

  const setProfileAndOpenConsoleInFirefox = async (profile: Profile) => {
    const didSetProfile = await setProfile(profile);

    if (!didSetProfile) {
      return;
    }

    await openInFirefoxContainer(profile);
  };

  const setProfileAndOpenConsole = async (profile: Profile) => {
    const didSetProfile = await setProfile(profile);

    if (!didSetProfile) {
      return;
    }

    await openConsole(profile);
  };

  // Group profiles by sso_session
  const groupedProfiles = profiles?.reduce<Record<string, Profile[]>>((acc, profile) => {
    const session = profile.sso_session || "No Session";
    if (!acc[session]) {
      acc[session] = [];
    }
    acc[session].push(profile);
    return acc;
  }, {});

  const sortedGroupEntries = groupedProfiles
    ? Object.entries(groupedProfiles).sort(([, aProfiles], [, bProfiles]) => {
        const aHasActive = aProfiles.some((p) => p.is_active);
        const bHasActive = bProfiles.some((p) => p.is_active);
        if (aHasActive && !bHasActive) return -1;
        if (!aHasActive && bHasActive) return 1;
        return 0;
      })
    : undefined;

  return (
    <List isLoading={isLoading}>
      {sortedGroupEntries &&
        sortedGroupEntries.map(([session, sessionProfiles]) => (
          <List.Section key={session} title={session}>
            {[...sessionProfiles].sort((a, b) => (a.is_active ? -1 : b.is_active ? 1 : 0)).map((profile) => (
              <List.Item
                key={profile.name}
                icon={
                  profile.is_active
                    ? {
                        source: {
                          light: "connected_light.png",
                          dark: "connected_dark.png",
                        },
                        mask: Image.Mask.Circle,
                      }
                    : {
                        source: {
                          light: "lastseen_light.png",
                          dark: "lastseen_dark.png",
                        },
                        mask: Image.Mask.Circle,
                      }
                }
                title={profile.name}
                subtitle={profile.sso_session}
                accessories={[{ icon: Icon.Globe, text: profile.region }]}
                actions={
                  <ActionPanel>
                    <Action title="Set Profile" icon={Icon.Checkmark} onAction={() => setProfile(profile)} />
                    <Action
                      title="Set Profile and Open Console"
                      icon={Icon.Bolt}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                      onAction={() => setProfileAndOpenConsole(profile)}
                    />
                    <Action
                      title="Open Console"
                      icon={Icon.Globe}
                      shortcut={{ modifiers: ["cmd"], key: "o" }}
                      onAction={() => openConsole(profile)}
                    />
                    <Action
                      title="Set Profile and Open Console in Firefox"
                      icon={Icon.Bird}
                      shortcut={{ modifiers: ["cmd", "opt"], key: "f" }}
                      onAction={() => setProfileAndOpenConsoleInFirefox(profile)}
                    />
                    <Action
                      title="Open in Firefox Container"
                      icon={Icon.Bird}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
                      onAction={() => openInFirefoxContainer(profile)}
                    />
                    <Action.CopyToClipboard
                      title="Copy Account ID"
                      icon={Icon.Clipboard}
                      content={profile.account_id}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))}
    </List>
  );
}
