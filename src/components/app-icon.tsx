import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import Svg, { Path } from 'react-native-svg';

export type AppIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
};

// Tek bir ikon ailesi kullanmak Android, iOS ve masaüstünde aynı sade görünümü sağlar.
export function AppIcon({ name, size = 22, color = '#174E3A' }: AppIconProps) {
  const sprout = 'M12 22V12M12 16C4 16 3 10 3 5C10 5 12 9 12 16M12 12C12 5 17 3 22 3C22 9 18 12 12 12';
  const basket = 'M3 10H21L18 22H6ZM8 10C8 2 16 2 16 10M4 13H20M5 17H19M8 10L15 22M13 10L19 20M19 10L11 22M13 10L6 20';
  const receipt = 'M5 2H19V22L15.5 20L12 22L8.5 20L5 22ZM8 7H16M8 11H16M8 15H13';
  const paths: Partial<Record<AppIconName, string>> = {
    'leaf': sprout, 'leaf-circle-outline': basket, 'basket-outline': basket,
    'robot-happy-outline': 'M5 8H19Q22 8 22 11V18Q22 21 19 21H5Q2 21 2 18V11Q2 8 5 8ZM8 13V15M16 13V15M9 18H15M12 8V5M12 5C7 5 7 1 7 1C12 1 12 5 12 5M12 5C12 1 17 1 17 1C17 5 12 5 12 5',
    'robot-outline': 'M5 8H19Q22 8 22 11V18Q22 21 19 21H5Q2 21 2 18V11Q2 8 5 8ZM8 13V15M16 13V15M9 18H15M12 8V3M10 3H14',
    'sprout': sprout, 'sprout-outline': sprout,
    'factory': 'M3 22V10L9 14V8L15 12V3H20V22ZM7 18H8M12 18H13M17 18H18',
    'wallet-outline': 'M3 6L18 3V6M3 6H21V21H3ZM16 12H21V17H16ZM18 14.5H18.01',
    'cash-multiple': 'M4 6C4 2 20 2 20 6C20 10 4 10 4 6ZM4 6V11C4 15 20 15 20 11V6M4 11V16C4 20 20 20 20 16V11M4 16V20C4 24 20 24 20 20V16',
    'hand-coin-outline': receipt, 'cash-clock': receipt, 'receipt-text-outline': receipt,
    'view-dashboard-outline': 'M3 11L12 3L21 11M5 10V21H10V15H14V21H19V10',
    'view-grid-outline': 'M4 12H4.01M12 12H12.01M20 12H20.01',
  };
  if (paths[name]) return <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={paths[name]} fill="none" stroke={color} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
