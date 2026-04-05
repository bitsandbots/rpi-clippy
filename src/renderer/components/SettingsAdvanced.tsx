import { clippyApi } from "../clippyApi";

export const SettingsAdvanced: React.FC = () => {
  return (
    <div>
      <fieldset>
        <legend>Delete All Models</legend>
        <p>
          This will delete all models from Clippy. This action is not
          reversible.
        </p>
        <button onClick={() => clippyApi.deleteAllModels()}>
          Delete All Models
        </button>
      </fieldset>
    </div>
  );
};
