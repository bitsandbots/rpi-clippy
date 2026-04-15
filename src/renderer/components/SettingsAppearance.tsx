import { DEFAULT_SETTINGS } from "../../sharedState";
import { clippyApi } from "../clippyApi";
import { useSharedState } from "../contexts/SharedStateContext";
import { UITheme } from "../../sharedState";

export const SettingsAppearance: React.FC = () => {
  const { settings } = useSharedState();

  const onChangeFontSize = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (!isNaN(newSize)) {
      clippyApi.setState("settings.defaultFontSize", newSize);
    }
  };

  const onChangeTheme = (event: React.ChangeEvent<HTMLSelectElement>) => {
    clippyApi.setState("settings.uiTheme", event.target.value as UITheme);
  };

  const onReset = () => {
    clippyApi.setState("settings.defaultFont", DEFAULT_SETTINGS.defaultFont);
    clippyApi.setState(
      "settings.defaultFontSize",
      DEFAULT_SETTINGS.defaultFontSize,
    );
    clippyApi.setState("settings.uiTheme", DEFAULT_SETTINGS.uiTheme);
  };

  return (
    <div>
      <fieldset>
        <legend>Appearance</legend>
        <div className="field-row">
          <label htmlFor="uiTheme" style={{ width: 80 }}>
            Theme:
          </label>
          <select
            id="uiTheme"
            value={settings.uiTheme || "refined"}
            onChange={onChangeTheme}
          >
            <option value="refined">Refined Authentic</option>
            <option value="expressive">Expressive Maximalist</option>
          </select>
        </div>
      </fieldset>
      <fieldset>
        <legend>Font Options</legend>
        <div className="field-row">
          <label style={{ width: 80 }}>Font size:</label>
          <label>8px</label>
          <input
            type="range"
            min="8"
            max="24"
            step={1}
            value={settings.defaultFontSize}
            onChange={onChangeFontSize}
          />
          <label>24px</label>
        </div>
        <div className="field-row">
          <label htmlFor="defaultFont" style={{ width: 80 }}>
            Font:
          </label>
          <select
            id="defaultFont"
            value={settings.defaultFont}
            onChange={(event) => {
              clippyApi.setState("settings.defaultFont", event.target.value);
            }}
          >
            <option value="Pixelated MS Sans Serif">
              Pixelated MS Sans Serif
            </option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Tahoma">Tahoma</option>
            <option value="System Default">System Default</option>
          </select>
        </div>
      </fieldset>
      <button style={{ marginTop: "10px" }} onClick={onReset}>
        Reset
      </button>
    </div>
  );
};
