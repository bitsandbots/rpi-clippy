import { sproutApi } from "../sproutApi";
import { useSharedState } from "../contexts/SharedStateContext";

interface ErrorLoadModelMessageContentProps {
  error: string;
}

export const ErrorLoadModelMessageContent: React.FC<
  ErrorLoadModelMessageContentProps
> = ({ error }) => {
  const { settings } = useSharedState();

  const handleCopyDebugInfo = async () => {
    sproutApi.clipboardWrite({
      text: JSON.stringify(
        {
          error,
          settings,
          state: await sproutApi.getDebugInfo(),
        },
        null,
        2,
      ),
    });
  };

  return (
    <div className="error-message">
      <p>
        Sadly, Sprout failed to successfully load the model. This could be an
        issue with Sprout itself, the selected model, or your system. You can
        report this error at{" "}
        <a
          href="https://github.com/bitsandbots/rpi-clippy/issues"
          target="_blank"
        >
          github.com/bitsandbots/rpi-clippy/issues
        </a>
        . Please include both the error message and the debug information.
      </p>
      <button onClick={handleCopyDebugInfo}>Copy error and debug info</button>
      <p>The error was:</p>
      <pre>{`${error}`}</pre>
    </div>
  );
};
