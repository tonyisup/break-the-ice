import CookieConsent from "react-cookie-consent";
import { useStorageContext } from "../hooks/useStorageContext";

const CookieConsentBanner = () => {
  const { hasConsented, setHasConsented } = useStorageContext();
  
  if (hasConsented) return null;

  return (
    <CookieConsent
      location="bottom"
      buttonText="I understand"
      cookieName="cookieConsent"
      style={{ background: "#2B373B" }}
      buttonStyle={{ color: "#4e503b", fontSize: "13px" }}
      expires={150}
      onAccept={() => {
        setHasConsented(true);
      }}
    >
      This website uses local storage to enhance the user experience.
    </CookieConsent>
  );
};

export default CookieConsentBanner;
