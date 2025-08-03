import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"
import dotenv from "dotenv"

dotenv.config()

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async(localFilePath) => {
    try {
        const res = await cloudinary.uploader.upload(
            localFilePath,{
                resource_type: "auto"
            }

        )
        console.log("File Uploaded!")
        fs.unlinkSync(localFilePath)
        return res
        
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null
    }
}

const deleteFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId)
        return result
        
    } catch (error) {
        console.log("Error deleting from Cloudinary")
        return null
    }
}

export {uploadOnCloudinary,deleteFromCloudinary}