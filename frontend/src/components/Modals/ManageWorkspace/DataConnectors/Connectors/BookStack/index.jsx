import { useState } from "react";
import { useTranslation } from "react-i18next";
import System from "@/models/system";
import showToast from "@/utils/toast";
import Toggle from "@/components/lib/Toggle";

export default function BookStackOptions() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);

        try {
            setLoading(true);
            showToast(
                "Fetching all pages from BookStack - this may take a while.",
                "info",
                {
                    clear: true,
                    autoClose: false,
                }
            );
            const { data, error } = await System.dataConnectors.bookstack.collect({
                baseUrl: form.get("baseUrl"),
                tokenId: form.get("tokenId"),
                tokenSecret: form.get("tokenSecret"),
                bypassSSL: form.get("bypassSSL") === "true",
            });

            if (!!error) {
                showToast(error, "error", { clear: true });
                setLoading(false);
                return;
            }

            showToast(
                `Pages collected from BookStack. Output folder is ${data.destination}.`,
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
                                    <label className="text-white text-sm font-bold flex gap-x-2 items-center">
                                        <p className="font-bold text-white">
                                            {t("connectors.bookstack.base_url")}
                                        </p>
                                    </label>
                                    <p className="text-xs font-normal text-theme-text-secondary">
                                        {t("connectors.bookstack.base_url_explained")}
                                    </p>
                                </div>
                                <input
                                    type="url"
                                    name="baseUrl"
                                    className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                                    placeholder="eg: https://bookstack.example.com, http://localhost:8080, etc..."
                                    required={true}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="flex flex-col pr-10">
                                <div className="flex flex-col gap-y-1 mb-4">
                                    <label className="text-white text-sm font-bold flex gap-x-2 items-center">
                                        <p className="font-bold text-white">
                                            {t("connectors.bookstack.token_id")}
                                        </p>
                                    </label>
                                    <p className="text-xs font-normal text-theme-text-secondary">
                                        {t("connectors.bookstack.token_id_explained")}
                                    </p>
                                </div>
                                <input
                                    type="text"
                                    name="tokenId"
                                    className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                                    placeholder="eg: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    required={true}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="flex flex-col pr-10">
                                <div className="flex flex-col gap-y-1 mb-4">
                                    <label className="text-white text-sm font-bold flex gap-x-2 items-center">
                                        <p className="font-bold text-white">
                                            {t("connectors.bookstack.token_secret")}
                                        </p>
                                    </label>
                                    <p className="text-xs font-normal text-theme-text-secondary">
                                        {t("connectors.bookstack.token_secret_explained")}
                                    </p>
                                </div>
                                <input
                                    type="password"
                                    name="tokenSecret"
                                    className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                                    placeholder="eg: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    required={true}
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </div>

                            <div className="w-full flex flex-col py-2">
                                <div className="w-full flex flex-col gap-4">
                                    <div className="flex flex-col pr-10">
                                        <div className="flex flex-col gap-y-1 mb-4">
                                            <label className="text-white text-sm font-bold flex gap-x-2 items-center cursor-pointer">
                                                <Toggle size="md" name="bypassSSL" value="true" />
                                                <p className="font-bold text-theme-text-primary">
                                                    {t("connectors.bookstack.bypass_ssl")}
                                                </p>
                                            </label>
                                            <p className="text-xs font-normal text-theme-text-secondary">
                                                {t("connectors.bookstack.bypass_ssl_explained")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-y-2 w-full pr-10">
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 w-full justify-center border-none px-4 py-2 rounded-lg text-dark-text light:text-white text-sm font-bold items-center flex gap-x-2 bg-theme-home-button-primary hover:bg-theme-home-button-primary-hover disabled:bg-theme-home-button-primary-hover disabled:cursor-not-allowed"
                        >
                            {loading ? t("connectors.bookstack.collecting") : t("connectors.bookstack.submit")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
