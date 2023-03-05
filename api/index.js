import { LensEnvironment, LensGatedSDK } from "@lens-protocol/sdk-gated";
import { providers } from "ethers";
import { createClient as createUrqlClient } from "urql";
import {
  generateRandomColor,
  getSigner,
  refreshAuthToken,
  signedTypeData,
} from "../utils";
import { createPostTypedData } from "./mutations";
import { getProfiles, getPublication, getPublications } from "./queries";

export const APIURL = "https://api-mumbai.lens.dev";
export const STORAGE_KEY = "LH_STORAGE_KEY";
export const LENS_HUB_CONTRACT_ADDRESS =
  "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82";
export const PERIPHERY_CONTRACT_ADDRESS =
  "0xD5037d72877808cdE7F669563e9389930AF404E8";

export const basicClient = new createUrqlClient({
  url: APIURL,
});

export const getGatedPublication = async (pubId, profileId) => {
  const urqlClient = await createClient();
  const result = await urqlClient
    .query(getPublication, {
      publicationId: pubId,
      profileId,
    })
    .toPromise();

  if (!result) {
    console.error("publication not found, exiting...");
    return;
  }

  let post = result.data.publication;

  if (!post.canDecrypt.result) {
    console.log("You cannot decrypt this publication, exiting...");
    return;
  }

  const provider = new providers.Web3Provider(window.ethereum);

  // instantiate SDK and connect to Lit Network
  const sdk = await LensGatedSDK.create({
    provider: provider,
    signer: getSigner(),
    env: LensEnvironment.Mumbai,
  });

  const { decrypted: metadata } = await sdk.gated.decryptMetadata(
    post.metadata
  );

  const decrypted = {
    ...result,
    metadata,
  };

  console.log("publication: decrypted", decrypted);
  return decrypted;
};

export async function fetchProfile(id, userProfile) {
  try {
    const urqlClient = await createClient();
    const returnedProfile = await urqlClient
      .query(getProfiles, { id })
      .toPromise();
    const profileData = returnedProfile.data.profiles.items[0];
    profileData.color = generateRandomColor();

    const pubs = await urqlClient
      .query(getPublications, { id: userProfile.id, limit: 50 })
      .toPromise();

    const publications = pubs.data.publications.items;

    const decryptedPublications = await Promise.all(
      publications.map(
        async (pub) => await getGatedPublication(pub.id, userProfile.id)
      )
    );

    const p = decryptedPublications
      .filter((pub) => pub != undefined)
      .map((pub) => pub.data.publication.metadata.description)
      .filter((pub) => pub.includes(profileData.handle));

    return {
      profile: profileData,
      publications: p,
    };
  } catch (err) {
    console.log("error fetching profile...", err);
  }
}

export async function createClient() {
  const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (storageData) {
    try {
      const { accessToken } = await refreshAuthToken();
      const urqlClient = new createUrqlClient({
        url: APIURL,
        fetchOptions: {
          headers: {
            "x-access-token": `Bearer ${accessToken}`,
          },
        },
      });
      return urqlClient;
    } catch (err) {
      return basicClient;
    }
  } else {
    return basicClient;
  }
}

export async function createPostTypedDataMutation(request, token) {
  const { accessToken } = await refreshAuthToken();
  const urqlClient = new createUrqlClient({
    url: APIURL,
    fetchOptions: {
      headers: {
        "x-access-token": `Bearer ${accessToken}`,
      },
    },
  });
  const result = await urqlClient
    .mutation(createPostTypedData, {
      request,
    })
    .toPromise();

  return result.data.createPostTypedData;
}

export const signCreatePostTypedData = async (request, token) => {
  const result = await createPostTypedDataMutation(request, token);
  const typedData = result.typedData;
  const signature = await signedTypeData(
    typedData.domain,
    typedData.types,
    typedData.value
  );
  return { result, signature };
};

export {
  authenticate,
  broadcast,
  createPostTypedData,
  createProfileMetadataTypedData,
  createUnfollowTypedData,
  followUser,
  refresh,
} from "./mutations";
export {
  doesFollow,
  explorePublications,
  getChallenge,
  getDefaultProfile,
  getProfiles,
  getPublications,
  recommendProfiles,
  searchProfiles,
  searchPublications,
  timeline,
} from "./queries";
