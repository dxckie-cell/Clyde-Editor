import { ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";

export default function Settings() {
  useProxy(storage);

  const { FormSection, FormInput, FormText } = (Forms ?? {}) as any;
  const { ScrollView } = ReactNative;

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
    </ScrollView>
  );
}
