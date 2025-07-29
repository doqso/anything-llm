import React, { useState } from "react";
import System from "@/models/system";
import showToast from "@/utils/toast";
import pluralize from "pluralize";
import { useTranslation } from "react-i18next";

export default function WebsiteDepthOptions() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [customHeaders, setCustomHeaders] = useState([{ key: "", value: "" }]);

  const addHeaderField = () => {
    setCustomHeaders([...customHeaders, { key: "", value: "" }]);
  };

  const removeHeaderField = (index) => {
    if (customHeaders.length > 1) {
      setCustomHeaders(customHeaders.filter((_, i) => i !== index));
    }
  };

  const updateHeaderField = (index, field, value) => {
    const updated = [...customHeaders];
    updated[index][field] = value;
    setCustomHeaders(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    try {
      setLoading(true);
      showToast("Scraping website - this may take a while.", "info", {
        clear: true,
        autoClose: false,
      });

      // Collect custom headers from form
      const customHeaders = {};
      const formData = new FormData(e.target);
      for (const [key, value] of formData.entries()) {
        if (key.startsWith("headerKey_") && value.trim()) {
          const index = key.split("_")[1];
          const headerValue = formData.get(`headerValue_${index}`);
          if (headerValue && headerValue.trim()) {
            customHeaders[value.trim()] = headerValue.trim();
          }
        }
      }

      const { data, error } = await System.dataConnectors.websiteDepth.scrape({
        url: form.get("url"),
        depth: parseInt(form.get("depth")),
        maxLinks: parseInt(form.get("maxLinks")),
        customHeaders,
      });

      if (!!error) {
        showToast(error, "error", { clear: true });
        setLoading(false);
        return;
      }

      showToast(
        `Successfully scraped ${data.length} ${pluralize(
          "page",
          data.length
        )}!`,
        "success",
        { clear: true }
      );
      e.target.reset();
      setLoading(false);
    } catch (e) {
      console.error(e);
      showToast(e.message, "error", { clear: true });
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full">
      <div className="flex flex-col w-full px-1 md:pb-6 pb-16">
        <form className="w-full" onSubmit={handleSubmit}>
          <div className="w-full flex flex-col py-2">
            <div className="w-full flex flex-col gap-4">
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    {t("connectors.website-depth.URL")}
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    {t("connectors.website-depth.URL_explained")}
                  </p>
                </div>
                <input
                  type="url"
                  name="url"
                  className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  placeholder="https://example.com"
                  required={true}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    Custom Headers (optional)
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    Add custom headers for authentication or other purposes. Common examples: Authorization, Cookie, User-Agent, etc.
                  </p>
                </div>
                {customHeaders.map((header, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      name={`headerKey_${index}`}
                      value={header.key}
                      onChange={(e) => updateHeaderField(index, "key", e.target.value)}
                      className="flex-1 border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
                      placeholder="Header Name (e.g., Authorization)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <input
                      type="text"
                      name={`headerValue_${index}`}
                      value={header.value}
                      onChange={(e) => updateHeaderField(index, "value", e.target.value)}
                      className="flex-1 border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none p-2.5"
                      placeholder="Header Value (e.g., Bearer token123)"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => removeHeaderField(index)}
                      disabled={customHeaders.length === 1}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm"
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addHeaderField}
                  className="mt-2 px-3 py-2 bg-primary-button hover:bg-primary-button-hover text-white rounded-lg text-sm"
                >
                  + Add Header
                </button>
              </div>
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    {" "}
                    {t("connectors.website-depth.depth")}
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    {t("connectors.website-depth.depth_explained")}
                  </p>
                </div>
                <input
                  type="number"
                  name="depth"
                  min="1"
                  max="5"
                  className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  required={true}
                  defaultValue="1"
                />
              </div>
              <div className="flex flex-col pr-10">
                <div className="flex flex-col gap-y-1 mb-4">
                  <label className="text-white text-sm font-bold">
                    {t("connectors.website-depth.max_pages")}
                  </label>
                  <p className="text-xs font-normal text-theme-text-secondary">
                    {t("connectors.website-depth.max_pages_explained")}
                  </p>
                </div>
                <input
                  type="number"
                  name="maxLinks"
                  min="1"
                  className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                  required={true}
                  defaultValue="20"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-y-2 w-full pr-10">
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full justify-center border-none px-4 py-2 rounded-lg text-dark-text light:text-white text-sm font-bold items-center flex gap-x-2 bg-theme-home-button-primary hover:bg-theme-home-button-primary-hover disabled:bg-theme-home-button-primary-hover disabled:cursor-not-allowed"
            >
              {loading ? "Scraping website..." : "Submit"}
            </button>
            {loading && (
              <p className="text-xs text-theme-text-secondary">
                {t("connectors.website-depth.task_explained")}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
