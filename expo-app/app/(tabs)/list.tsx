import { View, StyleSheet } from "react-native";
import Header from "@/components/Header";
import ControlBar from "@/components/ControlBar";
import ListViewComponent from "@/components/ListView";
import { COLORS } from "@/lib/theme";
import { useColorScheme } from "@/components/useColorScheme";

export default function ListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header />
      <ControlBar />
      <ListViewComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
