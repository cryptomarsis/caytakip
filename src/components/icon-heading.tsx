import { Text, View } from 'react-native';
import { AppIcon, AppIconName } from './app-icon';
import { styles } from '../styles/styles';
import { useAppTheme } from '../context/app-theme';

type IconHeadingProps = {
  icon: AppIconName;
  title: string;
  compact?: boolean;
};

export function IconHeading({ icon, title, compact = false }: IconHeadingProps) {
  const { paperTheme: theme } = useAppTheme();
  return (
    <View style={[styles.iconHeading, compact && styles.iconHeadingCompact]}>
      <View style={[styles.iconHeadingBadge, compact && styles.iconHeadingBadgeCompact, { backgroundColor: theme.colors.primaryContainer }]}>
        <AppIcon name={icon} size={compact ? 18 : 21} color={theme.colors.primary} />
      </View>
      <Text style={[compact ? styles.formTitle : styles.sectionTitle, { color: theme.colors.onSurface }]}>{title}</Text>
    </View>
  );
}
