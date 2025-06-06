// src/theme/appTheme.js
import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

export const appTheme = {
  ...DefaultTheme, // Start with MD3 Light Theme as a base
  version: 3,    // Specify MD3
  colors: {
    ...DefaultTheme.colors,
    primary: '#007AFF',       // A clear, modern blue (iOS-like)
    onPrimary: '#FFFFFF',     // Text/icons on primary color

    secondary: '#5856D6',     // A vibrant purple for secondary actions or highlights
    onSecondary: '#FFFFFF',

    tertiary: '#34C759',      // A pleasant green for tertiary elements or positive feedback
    onTertiary: '#FFFFFF',

    error: '#FF3B30',         // Standard error red
    onError: '#FFFFFF',

    background: '#F2F2F7',    // A very light grey, common for iOS-style backgrounds
    onBackground: '#1C1C1E',  // Darker text for better contrast on the light grey background

    surface: '#FFFFFF',       // Cards, sheets, menus
    onSurface: '#1C1C1E',     // Text on surfaces

    surfaceVariant: '#E5E5EA', // For elements like dividers or outlines on surface
    onSurfaceVariant: '#8A8A8E', // Text/icons on surfaceVariant (slightly darker for accessibility)

    outline: '#C7C7CC',       // Borders for inputs, cards if not elevated
    outlineVariant: '#D1D1D6', // A slightly lighter variant for outlines if needed

    // Inverse colors (useful for components on dark backgrounds if primary bg is light)
    inversePrimary: '#0A84FF', // A slightly lighter blue for dark backgrounds
    inverseOnSurface: '#F2F2F7', // Light text on dark inverse surface
    inverseSurface: '#303030',   // Dark inverse surface

    // Elevation colors (MD3 uses these for surfaces at different elevation levels)
    // These are typically slight overlays of a color (often primary or neutral)
    // on top of the surface color, with increasing opacity.
    // For simplicity, we can start with DefaultTheme's elevation and adjust if specific needs arise.
    // Or, define them as semi-transparent overlays or slightly different solid colors.
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF', // Surface color
      level2: 'rgba(242, 242, 247, 0.95)', // Example: Surface with slight opacity or lighter variant of background
      level3: 'rgba(239, 239, 244, 0.9)',  // Further differentiated
      level4: 'rgba(235, 235, 240, 0.85)',
      level5: 'rgba(230, 230, 235, 0.8)',
    },

    // Custom colors (can be added here and accessed via theme.colors.customXYZ)
    customSuccess: '#34C759', // Same as tertiary for now, but could be distinct
    customWarning: '#FF9500', // iOS orange for warnings
    customGray: '#8E8E93',   // iOS system gray
    customLightGray: '#AEAEB2',
    customGreenForPositive: '#28a745', // A common green for positive financial figures
    customRedForNegative: '#dc3545',   // A common red for negative financial figures
  },
  fonts: {
    ...DefaultTheme.fonts,
    // Example: If using a system font like San Francisco (iOS) or Roboto (Android) explicitly
    // This is often handled well by DefaultTheme, but explicit definition can ensure consistency
    // regular: {
    //   fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    //   fontWeight: '400',
    // },
    // medium: {
    //   fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto-Medium',
    //   fontWeight: '500',
    // },
    // thin: {
    //   fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto-Thin',
    //   fontWeight: '100',
    // },
    // light: {
    //   fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto-Light',
    //   fontWeight: '300',
    // }
  },
  roundness: 10, // Adjusted roundness for a slightly more modern feel than default 4 or 8.
  // You can also override other properties like spacing, animation scale, etc.
  // spacing: {
  //   iconSize: 24,
  //   // ...
  // }
};
