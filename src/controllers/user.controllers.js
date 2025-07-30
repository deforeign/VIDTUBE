import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import {User} from "../models/user.models.js"
import { uploadOnCloudinary,deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async(req,res) => {
    const {fullName, email, username, password}=req.body 

    if(
        [fullName, email, username, password].some((field) => field?.trim()==="")
    ){
        throw new ApiError(400,"All fields are required")
    }
    const existedUser = await User.findOne({
        $or: [{username} , {email}]
    })

    if(existedUser){
        throw new ApiError(400,"User Exists!")
    }

    const avatarLocalPath=req.files?.avatar?.[0]?.path
    const coverLocalPath=req.files?.coverImage?.[0]?.path

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar Image is missing!")
    }

    // const avatar = await uploadOnCloudinary(avatarLocalPath)

    // if(!coverLocalPath){
    //     throw new ApiError(400,"Cover Image is missing!")
    // }

    // const cover = await uploadOnCloudinary(coverLocalPath)
    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Uploaded Avatar", avatar)
        
    } catch (error) {
        console.log("Error uploading Avatar", error)
        throw new ApiError(500,"Failed to upload Avatar")
        
    }
    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log("Uploaded Cover Image", coverImage)
        
    } catch (error) {
        console.log("Error uploading Cover Image", error)
        throw new ApiError(500,"Failed to upload Cover Image")
        
    }

    try {
        const user = await User.create({
            fullName,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken"
        )
    
        if(!createdUser){
            throw new ApiError(500,"Something went wrong while creating user!")
        }
        return res.status(200).json(new ApiResponse(200, createdUser,"User Registered Successfully"))
    } catch (error) {
        console.log("User Connection Failed")
        if(avatar){
            await deleteFromCloudinary(avatar.public_id)
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id)
        }

        throw new ApiError(500,"Something went wrong and images were deleted!")
        
    }
})

export {
    registerUser
}