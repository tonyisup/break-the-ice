import CookieConsent from "react-cookie-consent";
import { Link } from "react-router-dom";
import { useStorageContext } from "../hooks/useStorageContext";

const CookieConsentBanner = () => {
  const { hasConsented, setHasConsented, revokeConsent } = useStorageContext();

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
      enableDeclineButton
      declineButtonText="Necessary only"
      declineButtonStyle={{
        background: "transparent",
        border: "1px solid white",
        color: "white",
        fontSize: "13px",
        marginLeft: "15px",
      }}
      onDecline={() => {
        revokeConsent();
      }}
    >
      This website uses <Link to="/cookies" className="underline hover:text-gray-300">cookies and local storage</Link> to enhance the user experience and for analytics.
    </CookieConsent>
  );
};

export default CookieConsentBanner;
