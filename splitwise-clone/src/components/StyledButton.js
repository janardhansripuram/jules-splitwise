import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

const COLORS = {
  primary: '#007bff',
  secondary: '#6c757d',
  success: '#28a745',
  danger: '#dc3545',
  light: '#f8f9fa',
  white: '#ffffff',
  textDark: '#212529',
  textLight: '#ffffff',
};

const StyledButton = ({ title, onPress, type = 'primary', style, textStyle, disabled }) => {
  const buttonStyles = [
    styles.button,
    type === 'primary' && styles.primaryButton,
    type === 'secondary' && styles.secondaryButton,
    type === 'success' && styles.successButton,
    type === 'danger' && styles.dangerButton,
    disabled && styles.disabledButton,
    style, // Custom style prop
  ];

  const textStyles = [
    styles.buttonText,
    (type === 'primary' || type === 'success' || type === 'danger') && styles.textLight,
    type === 'secondary' && styles.textDark, // Or light depending on desired secondary look
    disabled && styles.disabledText,
    textStyle, // Custom text style prop
  ];

  return (
    <TouchableOpacity onPress={onPress} style={buttonStyles} disabled={disabled}>
      <Text style={textStyles}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
    minWidth: 100, // Ensure buttons have a decent minimum width
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: COLORS.secondary,
    // Consider adding a border for secondary if it's too plain:
    // borderWidth: 1,
    // borderColor: COLORS.primary,
  },
  successButton: {
    backgroundColor: COLORS.success,
  },
  dangerButton: {
    backgroundColor: COLORS.danger,
  },
  disabledButton: {
    backgroundColor: '#ced4da', // Lighter gray for disabled
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  textLight: {
    color: COLORS.textLight,
  },
  textDark: {
    color: COLORS.textDark, // Or COLORS.textLight if secondary bg is dark
  },
  disabledText: {
    color: '#6c757d', // Darker gray text for disabled buttons
  }
});

export default StyledButton;
