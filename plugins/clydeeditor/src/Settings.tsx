import { React, ReactNative } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { clearLogs, counters, dlog, getLogText, logs, subscribe } from "./debug";

console.log("[ClydeEditor] Settings module evaluated", {
  Forms: typeof Forms,
  formKeys: Forms ? Object.keys(Forms) : null,
});

function copyLog(): void {
  const text = getLogText();
  try {
    const clipboard = findByProps("setString")?.setString ? findByProps("setString") : ReactNative.Clipboard;
    clipboard.setString(text);
    showToast("Debug log copied");
  } catch (e) {
    dlog("copy failed", e);
    showToast("Could not copy, select the text instead");
  }
}

function DebugLog() {
  const { FormSection, FormRow, FormText } = (Forms ?? {}) as any;
  const { Text, View } = ReactNative;

  // re-render whenever a line is added
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribe(bump), []);

  const counterLines = Object.entries(counters).map(([k, v]) => `${k}: ${v}`);

  return (
    <FormSection title="Debug log" titleStyleType="no_border">
      <FormRow label="Copy log" subLabel={`${logs.length} lines`} onPress={copyLog} />
      <FormRow label="Clear log" onPress={() => clearLogs()} />
      <FormText style={{ marginHorizontal: 16, marginTop: 8, opacity: 0.6 }}>
        Open Clyde's profile (or his DM and then his profile), then come back here. Lines starting with the
        function name mean that patch ran for Clyde.
      </FormText>
      <View style={{ margin: 16 }}>
        {counterLines.length > 0 && (
          <Text selectable style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.9, marginBottom: 8 }}>
            {"counters\n" + counterLines.map((l) => "  " + l).join("\n")}
          </Text>
        )}
        <Text selectable style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.8 }}>
          {logs.length ? logs.join("\n") : "(empty)"}
        </Text>
      </View>
    </FormSection>
  );
}

export default function Settings() {
  console.log("[ClydeEditor] Settings rendering");
  useProxy(storage);

  const { FormSection, FormInput, FormText } = (Forms ?? {}) as any;
  const { ScrollView } = ReactNative;
  console.log("[ClydeEditor] components", {
    FormSection: !!FormSection,
    FormInput: !!FormInput,
    FormText: !!FormText,
  });

  return (
    <ScrollView>
      <FormSection title="Clyde Editor" titleStyleType="no_border">
        <FormInput title="Name" placeholder="Clyde" value={storage.name} onChange={(v: string) => (storage.name = v)} />
        <FormInput title="Avatar" placeholder="https://example.com/avatar.png" value={storage.avatar} onChange={(v: string) => (storage.avatar = v)} />
        <FormInput title="Banner" placeholder="https://example.com/banner.png" value={storage.banner} onChange={(v: string) => (storage.banner = v)} />
        <FormText style={{ margin: 16, opacity: 0.6 }}>
          Leave a field empty to keep Clyde's default name, avatar or banner. You should reload after updating.
        </FormText>
      </FormSection>
      <DebugLog />
    </ScrollView>
  );
}
