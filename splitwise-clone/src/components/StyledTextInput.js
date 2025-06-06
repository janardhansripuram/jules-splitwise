import React from 'react';
import { StyleSheet } from 'react-native';
import { TextInput as PaperTextInput, useTheme } from 'react-native-paper';

const StyledTextInput = (props) => {
  const theme = useTheme();
  const { style, label, mode = 'outlined', ...rest } = props; // Default mode to outlined

  // Note: PaperTextInput handles its own focus styling (border color, label animation)
  // based on the theme's primary color. Manual isFocused state is not typically needed.
  // Placeholder color is also handled by the theme.

  return (
    <PaperTextInput
      label={label} // PaperTextInput uses 'label' prop which acts as placeholder when not focused
      mode={mode}
      style={[styles.inputDefault, style]} // Apply default styles, then custom ones
      theme={{ roundness: theme.roundness }} // Ensure component uses theme roundness
      // Pass common props directly. Specific PaperTextInput props can also be passed.
      // placeholder={props.placeholder} // Can still use placeholder if label is not desired or for specific cases
      // value={props.value}
      // onChangeText={props.onChangeText}
      // secureTextEntry={props.secureTextEntry}
      // keyboardType={props.keyboardType}
      // autoCapitalize={props.autoCapitalize}
      // disabled={props.disabled}
      // error={props.error}
      // left={props.left}
      // right={props.right}
      {...rest} // Pass all other props through
    />
  );
};

const styles = StyleSheet.create({
  inputDefault: {
    marginBottom: 16, // Consistent vertical margin
    // backgroundColor: 'transparent', // Outlined mode usually has transparent bg by default with theme
                                   // Or theme.colors.surface for flat mode if needed.
    // fontSize: 16, // Default font size is usually good from theme
    // width: '100%', // PaperTextInput is often full width by default in its container
  },
  // Removed inputFocused style as PaperTextInput handles focus based on theme.
});

export default StyledTextInput;
