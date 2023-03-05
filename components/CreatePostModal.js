import { css } from "@emotion/css";
import { LensEnvironment, LensGatedSDK } from "@lens-protocol/sdk-gated";
import { ethers, providers } from "ethers";
import { create } from "ipfs-http-client";
import { useContext, useRef } from "react";
import { v4 as uuid } from "uuid";
import LENSHUB from "../abi/lenshub";
import { LENS_HUB_CONTRACT_ADDRESS, signCreatePostTypedData } from "../api";
import { AppContext } from "../context";
import { getSigner, refreshAuthToken, splitSignature } from "../utils";

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
const projectSecret = process.env.NEXT_PUBLIC_PROJECT_SECRET;
const auth =
  "Basic " + Buffer.from(projectId + ":" + projectSecret).toString("base64");

const client = create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
  headers: {
    authorization: auth,
  },
});

const prefix = "create gated post";

export const eoaAccessCondition = (address) => ({
  eoa: {
    address,
  },
});

export default function CreatePostModal({ setIsModalOpen }) {
  const context = useContext(AppContext);
  const { userAddress, profile } = context;
  const inputRef = useRef(null);

  const uploadIpfsGetPath = async (data) => {
    const result = await client.add(JSON.stringify(data));
  
    console.log('upload result ipfs', result);
    return result.path;
  };
  

  const createGatedPublicPostRequest = async (
    profileId,
    metadata,
    condition
  ) => {
    const provider = new providers.Web3Provider(window.ethereum);

    // instantiate SDK and connect to Lit Network
    const sdk = await LensGatedSDK.create({
      provider: provider,
      signer: getSigner(),
      env: LensEnvironment.Mumbai,
    });

    const { contentURI, encryptedMetadata, error } =
      await sdk.gated.encryptMetadata(
        metadata,
        profileId,
        condition,
        uploadIpfsGetPath
      );

    await sdk.disconnect();

    if (error) {
      console.error(error);
      throw error;
    }

    console.log(`${prefix}: ipfs result`, contentURI);
    console.log(`${prefix}: encryptedMetadata`, encryptedMetadata);

    // hard coded to make the code example clear
    return {
      request: {
        profileId,
        contentURI: "ipfs://" + contentURI,
        collectModule: {
          freeCollectModule: { followerOnly: false },
        },
        referenceModule: {
          followerOnlyReferenceModule: false,
        },
        gated: {
          ...encryptedMetadata.encryptionParams.accessCondition,
          encryptedSymmetricKey:
            encryptedMetadata.encryptionParams.providerSpecificParams
              .encryptionKey,
        },
      },
      contentURI: contentURI,
      encryptedMetadata: encryptedMetadata,
    };
  };

  const createPostGated = async () => {
    const profileId = profile.id;
    if (!profileId) {
      throw new Error("Must define PROFILE_ID in the .env to run this");
    }

    const { accessToken } = await refreshAuthToken();

    const metadata = {
      version: "2.0.0",
      mainContentFocus: "TEXT_ONLY",
      metadata_id: uuid(),
      locale: "en-US",
      content: inputRef.current.innerHTML,
      description: inputRef.current.innerHTML,
      external_url: null,
      image: null,
      imageMimeType: null,
      name: "Name",
      attributes: [],
      tags: ["using_api_examples"],
      appId: "api_examples_github",
      // media: [
      //   {
      //     type: 'image/png',
      //     altTag: 'alt tag',
      //     cover: 'ipfs://QmZq4ozZ4ZAoPuPnujgyhQmpmsQTJnBS36KfijUCqmnhQa',
      //     item: 'ipfs://QmZq4ozZ4ZAoPuPnujgyhQmpmsQTJnBS36KfijUCqmnhQa',
      //   },
      // ],
      animation_url: null,
    };

    const { request } = await createGatedPublicPostRequest(
      profileId,
      metadata,
      eoaAccessCondition(userAddress)
    );

    const signedResult = await signCreatePostTypedData(request, accessToken);
    console.log(`${prefix}: signedResult`, signedResult);

    const typedData = signedResult.result.typedData;

    const { v, r, s } = splitSignature(signedResult.signature);

    const contract = new ethers.Contract(
      LENS_HUB_CONTRACT_ADDRESS,
      LENSHUB,
      getSigner()
    );

    const tx = await contract.postWithSig({
      profileId: typedData.value.profileId,
      contentURI: typedData.value.contentURI,
      collectModule: typedData.value.collectModule,
      collectModuleInitData: typedData.value.collectModuleInitData,
      referenceModule: typedData.value.referenceModule,
      referenceModuleInitData: typedData.value.referenceModuleInitData,
      sig: {
        v,
        r,
        s,
        deadline: typedData.value.deadline,
      },
    });

    await tx.wait();
    console.log("successfully created post: tx hash", tx.hash);
    setIsModalOpen(false);
  };

  async function savePost() {
    const contentURI = await uploadToIPFS();
    const { accessToken } = await refreshAuthToken();
    const createPostRequest = {
      profileId: profile.id,
      contentURI,
      collectModule: {
        freeCollectModule: { followerOnly: true },
      },
      referenceModule: {
        followerOnlyReferenceModule: false,
      },
    };

    try {
      const signedResult = await signCreatePostTypedData(
        createPostRequest,
        accessToken
      );
      const typedData = signedResult.result.typedData;
      const { v, r, s } = splitSignature(signedResult.signature);

      const contract = new ethers.Contract(
        LENS_HUB_CONTRACT_ADDRESS,
        LENSHUB,
        getSigner()
      );

      const tx = await contract.postWithSig({
        profileId: typedData.value.profileId,
        contentURI: typedData.value.contentURI,
        collectModule: typedData.value.collectModule,
        collectModuleInitData: typedData.value.collectModuleInitData,
        referenceModule: typedData.value.referenceModule,
        referenceModuleInitData: typedData.value.referenceModuleInitData,
        sig: {
          v,
          r,
          s,
          deadline: typedData.value.deadline,
        },
      });

      await tx.wait();
      console.log("successfully created post: tx hash", tx.hash);
      setIsModalOpen(false);
    } catch (err) {
      console.log("error: ", err);
    }
  }
  return (
    <div className={containerStyle}>
      <div className={contentContainerStyle}>
        <div className={topBarStyle}>
          <div className={topBarTitleStyle}>
            <p>Create post</p>
          </div>
          <div onClick={() => setIsModalOpen(false)}>
            <img src="/close.svg" className={createPostIconStyle} />
          </div>
        </div>
        <div className={contentStyle}>
          <div className={bottomContentStyle}>
            <div className={postInputStyle} contentEditable ref={inputRef} />
            <div className={buttonContainerStyle}>
              <button className={buttonStyle} onClick={createPostGated}>
                Create Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = css`
  border: none;
  outline: none;
  background-color: rgb(249, 92, 255);
  padding: 13px 24px;
  color: #340036;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.35s;
  &:hover {
    background-color: rgba(249, 92, 255, 0.75);
  }
`;

const buttonContainerStyle = css`
  display: flex;
  justify-content: flex-end;
  margin-top: 15px;
`;

const postInputStyle = css`
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 8px;
  width: 100%;
  min-height: 60px;
  padding: 12px 14px;
  font-weight: 500;
`;

const bottomContentStyle = css`
  margin-top: 10px;
  max-height: 300px;
  overflow: scroll;
`;

const topBarStyle = css`
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding-bottom: 13px;
  padding: 15px 25px;
`;

const topBarTitleStyle = css`
  flex: 1;
  p {
    margin: 0;
    font-weight: 600;
  }
`;

const contentContainerStyle = css`
  background-color: white;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  width: 700px;
`;

const containerStyle = css`
  position: fixed;
  width: 100vw;
  height: 100vh;
  z-index: 10;
  top: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.35);
  h1 {
    margin: 0;
  }
`;

const contentStyle = css`
  padding: 15px 25px;
`;

const createPostIconStyle = css`
  height: 20px;
  cursor: pointer;
`;
