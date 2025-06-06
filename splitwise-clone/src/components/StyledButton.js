import React from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton, useTheme } from 'react-native-paper';

const StyledButton = (props) => {
  const theme = useTheme();
  const { mode: propMode, type, title, children, style, textStyle, buttonColor: propButtonColor, textColor: propTextColor, ...rest } = props;

  let mode = propMode;
  let buttonColor = propButtonColor;
  let textColor = propTextColor;
  let finalStyle = [styles.buttonDefault, style]; // Start with default style

  // Determine mode, buttonColor, textColor based on 'type' prop if provided
  // This allows for convenient shortcuts like type="primary" or type="secondary"
  // while still allowing direct control via mode, buttonColor, textColor props.
  if (type) {
    switch (type) {
      case 'primary':
        mode = mode || 'contained'; // Default to contained for primary
        // buttonColor = buttonColor || theme.colors.primary; // Usually handled by mode="contained"
        // textColor = textColor || theme.colors.onPrimary; // Usually handled by mode="contained"
        break;
      case 'secondary':
        mode = mode || 'outlined'; // Default to outlined for secondary
        // textColor = textColor || theme.colors.primary; // Outlined buttons often use primary text color
        // buttonColor = buttonColor || 'transparent'; // Outlined buttons have transparent background
        break;
      case 'success':
        mode = mode || 'contained';
        buttonColor = buttonColor || theme.colors.customSuccess || theme.colors.tertiary; // Use custom or fallback to tertiary
        // textColor = textColor || theme.colors.onTertiary; // Or theme.colors.onError if using error color for success bg
        break;
      case 'danger':
        mode = mode || 'contained';
        buttonColor = buttonColor || theme.colors.error;
        // textColor = textColor || theme.colors.onError;
        break;
      case 'text': // Explicit text button type
        mode = mode || 'text';
        // textColor = textColor || theme.colors.primary;
        break;
      case 'outline': // Explicit outline button type
        mode = mode || 'outlined';
        break;
      default:
        mode = mode || 'contained'; // Fallback to contained if type is unknown but provided
    }
  } else if (!mode) {
      mode = 'contained'; // Default mode if no type and no mode specified
  }


  return (
    <PaperButton
      mode={mode}
      buttonColor={buttonColor}
      textColor={textColor}
      style={finalStyle}
      labelStyle={[styles.labelDefault, textStyle]} // Allow custom textStyle to override labelStyle
      {...rest} // Pass through other PaperButton props like icon, loading, disabled, onPress
    >
      {title || children}
    </PaperButton>
  );
};

const styles = StyleSheet.create({
  buttonDefault: {
    marginVertical: 8, // Consistent vertical margin
    borderRadius: 10, // Consistent with appTheme roundness
    // Default padding is handled by PaperButton itself based on mode
  },
  labelDefault: {
    fontSize: 16,
    fontWeight: '500', // Default font weight for button text
    // paddingHorizontal: 8, // Add horizontal padding to text if button padding is too small
  },
});

export default StyledButton;
