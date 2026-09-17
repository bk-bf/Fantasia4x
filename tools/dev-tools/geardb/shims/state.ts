export const page = {
  get url(): URL {
    return new URL(window.location.href);
  }
};
