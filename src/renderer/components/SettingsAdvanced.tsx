import { sproutApi } from "../sproutApi";

export const SettingsAdvanced: React.FC = () => {
  return (
    <div>
      <fieldset>
        <legend>Delete All Models</legend>
        <p>
          This will delete all models from Sprout. This action is not
          reversible.
        </p>
        <button onClick={() => sproutApi.deleteAllModels()}>
          Delete All Models
        </button>
      </fieldset>
    </div>
  );
};
