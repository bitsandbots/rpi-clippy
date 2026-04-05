import { DEFAULT_SETTINGS } from "../../sharedState";
import { clippyApi } from "../clippyApi";
import { useSharedState } from "../contexts/SharedStateContext";

export const SettingsAppearance: React.FC = () => {
  const { settings } = useSharedState();

  const onChangeFontSize = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (!isNaN(newSize)) {
      clippyApi.setState("settings.defaultFontSize", newSize);
    }
  };

  const onReset = () => {
    clippyApi.setState("settings.defaultFont", DEFAULT_SETTINGS.defaultFont);
    clippyApi.setState(
      "settings.defaultFontSize",
      DEFAULT_SETTINGS.defaultFontSize,
    );
  };

  return (
    <div>
      <fieldset>
        <legend>Font Options</legend>
        <div className="field-row" style={{ width: 300 }}>
          <label style={{ width: 100 }}>Font size:</label>
          <label>8px</label>
          <input
            type="range"
            min="8"
            max="20"
            step={1}
            value={settings.defaultFontSize}
            onChange={onChangeFontSize}
          />
          <label>20px</label>
        </div>
        <div className="field-row" style={{ width: 300 }}>
          <label htmlFor="defaultFont" style={{ width: 58 }}>
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
      <button style={{ marginTop: 10 }} onClick={onReset}>
        Reset
      </button>
    </div>
  );
};
