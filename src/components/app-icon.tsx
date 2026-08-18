import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type AppIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
};

// Tek bir ikon ailesi kullanmak Android, iOS ve masaüstünde aynı sade görünümü sağlar.
export function AppIcon({ name, size = 22, color = '#174E3A' }: AppIconProps) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
