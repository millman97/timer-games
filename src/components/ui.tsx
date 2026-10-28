import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { needsScroll } from '../utils/layout';
import styles from './styles';

function OverflowArea({ children, centered = false }: PropsWithChildren<{ centered?: boolean }>) {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  return (
    <ScrollView
      style={styles.flex}
      keyboardShouldPersistTaps='handled'
      bounces={false}
      scrollEnabled={needsScroll(viewport, content)}
      showsVerticalScrollIndicator={needsScroll(viewport, content)}
      onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => setContent(height)}
      contentContainerStyle={styles.page}
    >
      <View style={[styles.content, centered && styles.centered]}>{children}</View>
    </ScrollView>
  );
}

export function Page({
  children,
  header,
  footer,
  centered = false,
  scroll = 'auto',
}: PropsWithChildren<{
  header?: ReactNode;
  footer?: ReactNode;
  centered?: boolean;
  scroll?: 'auto' | 'never';
}>) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!!header && (
          <View style={styles.chrome}>
            <View style={styles.chromeContent}>{header}</View>
          </View>
        )}
        {scroll === 'never' ? (
          <View style={[styles.flex, styles.page]}>
            <View style={[styles.content, centered && styles.centered]}>{children}</View>
          </View>
        ) : (
          <OverflowArea centered={centered}>{children}</OverflowArea>
        )}
        {!!footer && (
          <View style={styles.footer}>
            <View style={styles.chromeContent}>{footer}</View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Header({
  title,
  onBack,
  onHelp,
  backLabel = 'Back',
  disabled = false,
}: {
  title: string;
  onBack?: () => void;
  onHelp?: () => void;
  backLabel?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.header}>
      {onBack && <TextButton title={backLabel} onPress={onBack} disabled={disabled} />}
      <Text accessibilityRole='header' style={styles.headerTitle}>
        {title}
      </Text>
      {onHelp && <TextButton title='Rules' onPress={onHelp} disabled={disabled} />}
    </View>
  );
}
export function TextButton({
  title,
  onPress,
  disabled = false,
  label,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label || title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.textButtonText}>{title}</Text>
    </Pressable>
  );
}

export function Dialog({
  children,
  title,
  visible,
  onClose,
  footer,
}: PropsWithChildren<{
  title: string;
  visible: boolean;
  onClose: () => void;
  footer?: ReactNode;
}>) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType='none' onRequestClose={onClose}>
      <SafeAreaView style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text accessibilityRole='header' style={styles.dialogTitle}>
              {title}
            </Text>
            <TextButton title='×' label='Close' onPress={onClose} />
          </View>
          <ScrollView
            bounces={false}
            style={styles.dialogScroll}
            contentContainerStyle={styles.dialogBody}
            keyboardShouldPersistTaps='handled'
          >
            {children}
          </ScrollView>
          {!!footer && <View style={styles.dialogFooter}>{footer}</View>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}
export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole='header' style={styles.title}>
      {children}
    </Text>
  );
}
export function Copy({ children }: PropsWithChildren) {
  return <Text style={styles.copy}>{children}</Text>;
}
export function Panel({ children }: PropsWithChildren) {
  return <View style={styles.panel}>{children}</View>;
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  label,
  compact = false,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label || title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        secondary && styles.secondary,
        style,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}
export function BottomActions({
  onBack,
  backTitle = 'Back',
  title,
  onPress,
  disabled = false,
}: {
  onBack: () => void;
  backTitle?: string;
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.actions}>
      <Button title={backTitle} secondary onPress={onBack} style={styles.backAction} />
      <Button title={title} onPress={onPress} disabled={disabled} style={styles.primaryAction} />
    </View>
  );
}
export function Display({ value, caption }: { value: string; caption: string }) {
  return (
    <View style={styles.display}>
      <Text style={styles.digits} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
        {value}
      </Text>
      <Label>{caption}</Label>
    </View>
  );
}
export function Confirm({
  title,
  detail,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  detail: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      visible
      title={title}
      onClose={onCancel}
      footer={
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button title='Cancel' secondary onPress={onCancel} />
          </View>
          <View style={styles.flex}>
            <Button title={action} onPress={onConfirm} />
          </View>
        </View>
      }
    >
      <Copy>{detail}</Copy>
    </Dialog>
  );
}
