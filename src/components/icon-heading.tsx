import { Text, View } from 'react-native';
import { AppIcon, AppIconName } from './app-icon';
import { styles } from '../styles/styles';

type IconHeadingProps = {
  icon: AppIconName;
  title: string;
  compact?: boolean;
};

export function IconHeading({ icon, title, compact = false }: IconHeadingProps) {
  return (
    <View style={[styles.iconHeading, compact && styles.iconHeadingCompact]}>
      <View style={[styles.iconHeadingBadge, compact && styles.iconHeadingBadgeCompact]}>
        <AppIcon name={icon} size={compact ? 18 : 21} color="#1F6B4F" />
      </View>
      <Text style={compact ? styles.formTitle : styles.sectionTitle}>{title}</Text>
    </View>
  );
}
