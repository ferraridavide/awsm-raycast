import { ActionPanel, Action, Icon, List, Image, showToast, Toast, open } from "@raycast/api";
import { execAwsm } from "./shared";
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

  const profiles: Profile[] | undefined = data ? (() => {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  })() : undefined;

  useEffect(() => {
    if (error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load profiles",
        message: String(error),
      });
    }
  }, [error]);

  const setProfile = async (profile: Profile) => {
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
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to set profile";
      toast.message = String(error);
    }
  };

  const openConsole = async (profile: Profile) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Opening console...",
    });

    try {
      const result = execAwsm(`console -n -p ${profile.name}`);
      open(result);
      toast.hide();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to open console";
      toast.message = String(error);
    }
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
                    <Action title="Set Profile" onAction={() => setProfile(profile)} />
                    <Action title="Open Console" onAction={() => openConsole(profile)} />
                    <Action.CopyToClipboard title="Copy Account ID" content={profile.account_id} />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))}
    </List>
  );
}
