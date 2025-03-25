// src/services/cloudinary.js

const cloudinaryConfig = {
    cloudName: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME,
    uploadPreset: process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET,
};

console.log("Cloudinary Config:", cloudinaryConfig);


export const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('cloud_name', cloudinaryConfig.cloudName);
    console.log("Cloudinary Config:", cloudinaryConfig);
   try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erro no upload para o Cloudinary: ${response.status} - ${errorData.error.message || 'Erro desconhecido'}`);
        }
       const data = await response.json(); 
        return data.secure_url; 

    } catch (error) {
      console.error("Erro no upload:", error);
        throw error;
    }
};

