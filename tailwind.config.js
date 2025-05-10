const {} = require("tailwindcss/defaultTheme");

module.exports = {
  mode: "jit",
  darkMode: 'class',
  purge: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  variants: {
    extend: {},
  },
};
