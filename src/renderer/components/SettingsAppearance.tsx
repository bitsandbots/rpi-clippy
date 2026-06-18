import { DEFAULT_SETTINGS } from "../../sharedState";
import { sproutApi } from "../sproutApi";
import { useSharedState } from "../contexts/SharedStateContext";

export const SettingsAppearance: React.FC = () => {
  const { settings } = useSharedState();

  const onChangeFontSize = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (!isNaN(newSize)) {
      sproutApi.setState("settings.defaultFontSize", newSize);
    }
  };

  const onReset = () => {
    sproutApi.setState("settings.defaultFont", DEFAULT_SETTINGS.defaultFont);
    sproutApi.setState(
      "settings.defaultFontSize",
      DEFAULT_SETTINGS.defaultFontSize,
    );
  };

  return (
    <div>
      <fieldset>
        <legend>Font</legend>
        <div className="field-row">
          <label style={{ width: 80 }}>Size:</label>
          <label>8px</label>
          <input
            type="range"
            min="8"
            max="48"
            step={1}
            value={settings.defaultFontSize}
            onChange={onChangeFontSize}
          />
          <label>48px</label>
        </div>
        <div className="field-row">
          <label htmlFor="defaultFont" style={{ width: 80 }}>
            Family:
          </label>
          <select
            id="defaultFont"
            value={settings.defaultFont}
            onChange={(event) => {
              sproutApi.setState("settings.defaultFont", event.target.value);
            }}
          >
            <option value="Sans-serif">Sans-serif</option>
            <option value="Serif">Serif</option>
            <option value="Monospace">Monospace</option>
          </select>
        </div>
      </fieldset>
      <button style={{ marginTop: "10px" }} onClick={onReset}>
        Reset
      </button>
    </div>
  );
};
