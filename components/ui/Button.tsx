/**
 * Shared UI primitives — small, opinionated components built on the design
 * tokens. Keeping these centralized means every screen uses the same spacing,
 * radius, and touch-target rules (layout skill: consistency IS the affordance;
 * 44pt minimum touch targets).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { color, radius, space, type, touchTarget, shadow } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.accent, fg: '#fff' },
  secondary: { bg: color.accentSoft, fg: color.accent },
  ghost: { bg: 'transparent', fg: color.textSecondary },
  danger: { bg: color.danger, fg: '#fff' },
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: string;
  size?: 'md' | 'sm';
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  size = 'md',
  style,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const small = size === 'sm';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        small ? styles.sm : styles.md,
        { backgroundColor: v.bg },
        variant === 'secondary' && styles.bordered,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, small ? styles.labelSm : styles.labelMd, { color: disabled ? color.textFaint : v.fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A compact icon-only button (Run, Stop, Clear). 44pt min touch area. */
export interface IconButtonProps {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  variant?: Variant;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function IconButton({
  onPress,
  label,
  disabled = false,
  variant = 'ghost',
  children,
  style,
}: IconButtonProps) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconBtn,
        { backgroundColor: variant === 'ghost' ? 'transparent' : v.bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** A small status pill (run lifecycle, project meta). */
export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  md: { paddingVertical: space.sm + 2, paddingHorizontal: space.lg, minHeight: touchTarget },
  sm: { paddingVertical: space.xs + 2, paddingHorizontal: space.md, minHeight: 32 },
  bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.5 },
  label: { fontWeight: '600', letterSpacing: 0.1 },
  labelMd: { fontSize: type.body },
  labelSm: { fontSize: type.meta },
  iconBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: type.micro, fontWeight: '700', letterSpacing: 0.3 },
});

