// One galleries page serves every author's gallery and the page without a link to one: the `user`
// address parameter decides what to show, and the page learns it only in the browser.

import { atom, type ReadableAtom } from "nanostores";
import { queryParamOf, type Gallery } from "@/entities/gallery";
import { LOADING, settle, type Remote } from "@/shared/api/remote.ts";

/**
 * What is on the galleries page: the address is not read yet (this is how the page looks at build
 * time), the introduction without a gallery link, or an author's gallery.
 */
export type GalleryPage =
  | { readonly view: "opening" }
  | { readonly view: "intro" }
  | { readonly view: "author"; readonly login: string; readonly gallery: Remote<Gallery> };

/** Galleries page requests to the API. */
export interface GalleryRequests {
  fetchGallery(login: string): Promise<Gallery>;
}

/** Galleries page: what to show and the action that opens the page by its address. */
export interface GalleryPageModel {
  readonly $page: ReadableAtom<GalleryPage>;
  /**
   * Opens the author's gallery if the address has a login, otherwise the introduction.
   * @param {string} search Address parameters, `location.search`.
   * @returns {Promise<void>} When the data arrives or it is clear why there is none.
   */
  open(search: string): Promise<void>;
}

/**
 * Creates the galleries page model. The initial state is `opening`: this is also how the page
 * looks at build time, when there is no address with parameters yet, so those who came by an
 * author's link do not see the introduction flash.
 * @param {GalleryRequests} requests API requests.
 * @returns {GalleryPageModel} Page model.
 */
export function createGalleryPageModel(requests: GalleryRequests): GalleryPageModel {
  const $page = atom<GalleryPage>({ view: "opening" });

  const showAuthor = async (login: string) => {
    $page.set({ view: "author", login, gallery: LOADING });

    const gallery = await settle(() => requests.fetchGallery(login));

    $page.set({ view: "author", login, gallery });
  };

  return {
    $page,
    open: async (search) => {
      const login = queryParamOf(search, "galleryOwner");

      if (login === undefined) {
        $page.set({ view: "intro" });

        return;
      }

      await showAuthor(login);
    },
  };
}
