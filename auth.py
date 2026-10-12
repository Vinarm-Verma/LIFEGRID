from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_roles


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.get("/me")
def me(
    user: dict = Depends(get_current_user),
):
    """
    Return the authenticated LIFEGRID user.
    """

    return {
        "authenticated": True,
        "id": user["id"],
        "email": user.get("email"),
        "role": user.get("role", "citizen"),
    }


@router.get("/check/coordinator")
def check_coordinator(
    user: dict = Depends(
        require_roles(
            "coordinator",
            "admin",
        )
    ),
):
    """
    Verify that the authenticated user can
    access coordinator functionality.
    """

    return {
        "authorized": True,
        "role": user["role"],
        "message": "Coordinator access granted.",
    }


@router.get("/check/hospital")
def check_hospital(
    user: dict = Depends(
        require_roles(
            "hospital",
            "coordinator",
            "admin",
        )
    ),
):
    """
    Verify hospital-level access.
    """

    return {
        "authorized": True,
        "role": user["role"],
        "message": "Hospital access granted.",
    }


@router.get("/check/ambulance")
def check_ambulance(
    user: dict = Depends(
        require_roles(
            "ambulance",
            "coordinator",
            "admin",
        )
    ),
):
    """
    Verify ambulance-level access.
    """

    return {
        "authorized": True,
        "role": user["role"],
        "message": "Ambulance access granted.",
    }


@router.get("/check/resource-provider")
def check_resource_provider(
    user: dict = Depends(
        require_roles(
            "resource_provider",
            "coordinator",
            "admin",
        )
    ),
):
    """
    Verify resource-provider access.
    """

    return {
        "authorized": True,
        "role": user["role"],
        "message": "Resource provider access granted.",
    }


@router.get("/check/admin")
def check_admin(
    user: dict = Depends(
        require_roles("admin")
    ),
):
    """
    Verify administrator access.
    """

    return {
        "authorized": True,
        "role": user["role"],
        "message": "Administrator access granted.",
    }